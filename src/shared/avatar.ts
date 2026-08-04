/**
 * The one place that decides which image to show for a member.
 *
 * Order: the member's self-chosen profile image (an uploaded /media/avatars/…
 * URL), then their Discord avatar, then Discord's default embed avatar. Used on
 * both the server and the client so an avatar never renders two ways. Mirrors
 * the name-resolution rule in shared/names.ts.
 */

const DISCORD_CDN = 'https://cdn.discordapp.com';

/**
 * Discord's built-in default avatar for accounts with no custom one. For the
 * modern username system it's derived from the account id, not the (legacy)
 * discriminator.
 */
function defaultDiscordAvatar(discordId: string): string {
  const index = (BigInt(discordId) >> 22n) % 6n;
  return `${DISCORD_CDN}/embed/avatars/${index}.png`;
}

/** The member's Discord avatar (or the default when they have none). */
export function discordAvatar(discordId: string, hash: string | null, size = 64): string {
  if (!hash) return defaultDiscordAvatar(discordId);
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `${DISCORD_CDN}/avatars/${discordId}/${hash}.${ext}?size=${size}`;
}

/**
 * The image to show for a member. A self-chosen profile image always wins;
 * otherwise fall back to their Discord avatar. `size` only affects the Discord
 * URL — an uploaded image is served at its stored size.
 */
export function memberAvatar(
  u: { discordId: string; avatar: string | null; profileImageUrl?: string | null },
  size = 64,
): string {
  return u.profileImageUrl?.trim() || discordAvatar(u.discordId, u.avatar, size);
}
