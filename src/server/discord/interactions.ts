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
  data?: { id: string; name: string; options?: InteractionOption[] };
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
 * Discord hangs up if you take longer than 3 seconds. Defer, then finish the
 * work in ctx.waitUntil() and post the real answer with DiscordRest.followUp().
 */
export function defer(isEphemeral = true) {
  return {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: isEphemeral ? { flags: MessageFlags.EPHEMERAL } : {},
  };
}
