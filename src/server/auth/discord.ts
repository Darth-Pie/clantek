/**
 * Discord OAuth2 authorization-code flow.
 *
 * There are no passwords in this system at all. Discord is the only identity
 * provider, which removes password storage, reset flows, and credential
 * stuffing from the threat model entirely.
 */

const DISCORD_API = 'https://discord.com/api/v10';

export const OAUTH_SCOPES = ['identify', 'email', 'guilds.members.read'] as const;

export const OAUTH_STATE_COOKIE = 'ct_oauth_state';

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email?: string | null;
}

export interface DiscordGuildMember {
  roles: string[];
  nick: string | null;
  joined_at: string;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    state,
    prompt: 'none',
  });
  return `${DISCORD_API}/oauth2/authorize?${params}`;
}

export function newState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function stateCookie(state: string): string {
  // Short-lived; only has to survive the round trip to Discord and back.
  return `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

export const clearedStateCookie = `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; token_type: string; expires_in: number }> {
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`Discord token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function fetchUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord /users/@me failed (${res.status})`);
  return res.json();
}

/**
 * The caller's membership in *your* guild. Returns null when they are not in
 * the server — which is how "you must be in the Discord to log in" is enforced.
 */
export async function fetchGuildMember(
  accessToken: string,
  guildId: string,
): Promise<DiscordGuildMember | null> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Discord guild member lookup failed (${res.status})`);
  return res.json();
}

export function avatarUrl(discordId: string, hash: string | null, size = 128): string {
  if (!hash) {
    const index = (BigInt(discordId) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${ext}?size=${size}`;
}
