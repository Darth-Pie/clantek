/**
 * The exact, least-privilege permission set the mustr bot needs — one source of
 * truth shared by the invite-link builder (admin) and the public trust page.
 *
 * Deliberately narrow: no Administrator, no Manage Server, no Kick/Ban, no
 * Manage Channels, and (because the bot runs on Cloudflare's HTTP Interactions
 * model, never the gateway) no Message Content intent. A server owner clicking
 * the invite sees this short list and nothing more.
 *
 * Bits are Discord permission flags. They're non-overlapping, so summing them
 * equals bitwise-OR; the total (2199425928192) stays well under
 * Number.MAX_SAFE_INTEGER, so plain numbers are safe here (a `|` would overflow
 * 32 bits — always add, never OR).
 */

export interface BotPermission {
  /** Discord permission flag (integer). */
  bit: number;
  /** Human name, as Discord shows it on the invite consent screen. */
  name: string;
  /** Plain-English reason mustr asks for it. */
  why: string;
}

export const BOT_PERMISSIONS: BotPermission[] = [
  { bit: 1024, name: 'View Channels', why: 'See the channel list so it knows where to post.' },
  { bit: 2048, name: 'Send Messages', why: 'Post event announcements and reminders.' },
  { bit: 16384, name: 'Embed Links', why: 'Show events as rich embeds instead of plain text.' },
  { bit: 268435456, name: 'Manage Roles', why: 'Keep members’ Discord roles in sync with their rank on the site.' },
  { bit: 134217728, name: 'Manage Nicknames', why: 'Keep members’ server nicknames in sync with their display name.' },
  { bit: 2199023255552, name: 'Manage Events', why: 'Create and update Discord’s built-in scheduled events.' },
];

/** The permissions integer for the invite URL (sum = bitwise-OR here). */
export const BOT_PERMISSIONS_BITS = BOT_PERMISSIONS.reduce((acc, p) => acc + p.bit, 0);

/** OAuth scopes: a bot that can register slash commands. Nothing else. */
export const BOT_OAUTH_SCOPES = ['bot', 'applications.commands'] as const;

/**
 * The pre-scoped invite link for a given Discord application (client) id.
 * Returns '' when the id is unknown, so callers can hide the control until the
 * app is configured.
 */
export function botInviteUrl(clientId: string): string {
  if (!/^\d{5,}$/.test(clientId)) return '';
  const params = new URLSearchParams({
    client_id: clientId,
    scope: BOT_OAUTH_SCOPES.join(' '),
    permissions: String(BOT_PERMISSIONS_BITS),
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
