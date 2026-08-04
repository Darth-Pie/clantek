/**
 * Discord slash commands, served over HTTP Interactions.
 *
 * Discord POSTs to a single "Interactions Endpoint URL" you register on the
 * application — no gateway WebSocket, which is exactly what makes this work on
 * Workers. The tradeoff worth knowing up front:
 *
 *   Slash commands and component clicks  -> work over HTTP, supported here.
 *   Passive gateway events (member joins, message sent, role changed in
 *   Discord's own UI)                    -> require a persistent WebSocket
 *                                           connection, which Workers cannot
 *                                           hold. Those need either a small
 *                                           always-on bot elsewhere, or a
 *                                           periodic reconciliation pull.
 *
 * The reconciliation approach is in sync.ts and covers most of the gap without
 * a second host.
 */

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  // For component (button) clicks: acknowledge without a visible loading state,
  // then edit the source message later via editOriginalMessage().
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
} as const;

export const MessageFlags = { EPHEMERAL: 1 << 6 } as const;

// The explicit <ArrayBuffer> matters: TypeScript 5.7 made Uint8Array generic
// over its backing buffer, and the bare form widens to ArrayBufferLike, which
// crypto.subtle will not accept.
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Discord signs every interaction request with Ed25519 and *will* send
 * deliberately invalid signatures when you register the endpoint — if this
 * returns true for a bad signature, registration fails by design.
 *
 * Workers' Web Crypto supports Ed25519 natively, so no library is needed.
 */
export async function verifySignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
): Promise<boolean> {
  if (!signature || !timestamp) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body),
    );
  } catch {
    return false;
  }
}

export interface InteractionOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: InteractionOption[];
}

export interface Interaction {
  id: string;
  application_id: string;
  type: number;
  token: string;
  guild_id?: string;
  // Slash commands carry name/options; component (button) clicks carry
  // custom_id/component_type.
  data?: {
    id?: string;
    name?: string;
    options?: InteractionOption[];
    custom_id?: string;
    component_type?: number;
  };
  // Present on component interactions — the message the button lives on.
  message?: { id: string };
  member?: {
    user: { id: string; username: string; global_name: string | null };
    roles: string[];
  };
  user?: { id: string; username: string; global_name: string | null };
}

/** The invoking Discord user, whether the command came from a guild or a DM. */
export function invoker(i: Interaction): { id: string; username: string } | null {
  const u = i.member?.user ?? i.user;
  return u ? { id: u.id, username: u.username } : null;
}

export function optionValue<T = string>(i: Interaction, name: string): T | undefined {
  return i.data?.options?.find((o) => o.name === name)?.value as T | undefined;
}

export function ephemeral(content: string) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: MessageFlags.EPHEMERAL },
  };
}

export function reply(content: string) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content },
  };
}

/**
 * Discord hangs up if you take longer than 3 seconds. Defer immediately, then
 * finish the work in ctx.waitUntil() and fill in the message with
 * editOriginalResponse().
 */
export function defer(isEphemeral = true) {
  return {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: isEphemeral ? { flags: MessageFlags.EPHEMERAL } : {},
  };
}

/**
 * Replaces the "thinking…" placeholder from a deferred response with the real
 * content. Authenticated by the interaction token itself — no bot token needed.
 * The ephemeral flag is fixed at defer time and cannot be changed here.
 */
export async function editOriginalResponse(
  applicationId: string,
  interactionToken: string,
  content: string,
): Promise<void> {
  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    },
  );
  if (!res.ok) {
    console.error(`Failed to edit interaction response (${res.status}):`, await res.text());
  }
}

/** A deferred acknowledgement for a component (button) click. */
export function deferUpdate() {
  return { type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE };
}

/**
 * Edit the message a component interaction belongs to (its "@original"). For a
 * button click that's the announcement/sign-up message — this refreshes its
 * embed counts and button labels. No bot token needed; the interaction token
 * authenticates it.
 */
export async function editOriginalMessage(
  applicationId: string,
  interactionToken: string,
  payload: { content?: string; embeds?: unknown[]; components?: unknown[] },
): Promise<void> {
  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    console.error(`Failed to edit component message (${res.status}):`, await res.text());
  }
}

/** Send a private (ephemeral) follow-up to whoever triggered the interaction. */
export async function followUpEphemeral(
  applicationId: string,
  interactionToken: string,
  content: string,
): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, flags: MessageFlags.EPHEMERAL }),
  });
  if (!res.ok) {
    console.error(`Failed to send follow-up (${res.status}):`, await res.text());
  }
}
