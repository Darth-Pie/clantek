/**
 * Runtime configuration — the layer that lets an operator reconfigure Discord
 * and site identity from the admin panel (or a first-run setup wizard) instead
 * of editing wrangler.jsonc and redeploying.
 *
 * Resolution is DB-over-env: a value saved in settings['identity'] wins; when it
 * is blank or unset, the wrangler var/secret in `env` is used. So a fresh,
 * env-only deploy keeps working, and the moment someone saves config in the UI
 * it takes effect without a redeploy. This is the seam that makes the product
 * deployable by other groups: they set their own Discord app + domain here.
 *
 * SECURITY: the stored blob can hold secrets (Discord client secret, bot token).
 * They live in D1, so they are readable by anything with DB access and by god
 * admins — unlike wrangler secrets, which are encrypted and unreadable. That is
 * an accepted trade for self-serve configuration; the admin API never echoes a
 * secret value back to a client (presence only). See settings.get('/identity').
 */

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import * as s from '../db/schema';
import type { Env } from './env';
import { DiscordRest } from './discord/rest';

/** settings key under which the identity/Discord blob is stored. */
export const IDENTITY_KEY = 'identity';

export interface DiscordConfig {
  clientId: string;
  guildId: string;
  publicKey: string;
  clientSecret: string;
  botToken: string;
}

export interface AppConfig {
  siteName: string;
  siteUrl: string;
  discord: DiscordConfig;
}

/** The shape persisted in settings['identity']. Every field optional — a blank
 *  or missing value falls through to the matching env var in loadConfig(). */
export interface StoredIdentity {
  siteName?: string;
  siteUrl?: string;
  discord?: Partial<DiscordConfig>;
}

type DB = ReturnType<typeof drizzle<typeof schema>>;

/** First non-empty (after trim) of the candidates, else ''. */
function firstNonEmpty(...vals: (string | undefined | null)[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

/**
 * Resolve the effective configuration: DB overrides (settings['identity']) first,
 * then the env fallbacks. Never throws — a missing row or table (first boot)
 * degrades cleanly to "env only".
 */
export async function loadConfig(env: Env, database?: DB): Promise<AppConfig> {
  const dbi = database ?? drizzle(env.DB, { schema });
  let stored: StoredIdentity = {};
  try {
    const row = await dbi.query.settings.findFirst({ where: eq(s.settings.key, IDENTITY_KEY) });
    if (row?.value && typeof row.value === 'object') stored = row.value as StoredIdentity;
  } catch {
    // No settings row/table yet (fresh install) → fall back to env entirely.
  }
  const d = stored.discord ?? {};
  return {
    siteName: firstNonEmpty(stored.siteName, env.SITE_NAME, 'ClanTek'),
    siteUrl: firstNonEmpty(stored.siteUrl, env.SITE_URL),
    discord: {
      clientId: firstNonEmpty(d.clientId, env.DISCORD_CLIENT_ID),
      guildId: firstNonEmpty(d.guildId, env.DISCORD_GUILD_ID),
      publicKey: firstNonEmpty(d.publicKey, env.DISCORD_PUBLIC_KEY),
      clientSecret: firstNonEmpty(d.clientSecret, env.DISCORD_CLIENT_SECRET),
      botToken: firstNonEmpty(d.botToken, env.DISCORD_BOT_TOKEN),
    },
  };
}

/** Build a bot REST client from resolved config, or null when the bot isn't set up. */
export function discordRestFromConfig(cfg: AppConfig): DiscordRest | null {
  if (!cfg.discord.botToken || !cfg.discord.guildId) return null;
  return new DiscordRest(cfg.discord.botToken, cfg.discord.guildId);
}

/**
 * Resolve config and build the bot client in one step. Replaces the ~nine
 * duplicated `env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID ? new DiscordRest(…)`
 * blocks, so every surface (web routes, cron, background) reads the same config.
 */
export async function discordClient(env: Env, database?: DB): Promise<DiscordRest | null> {
  return discordRestFromConfig(await loadConfig(env, database));
}

/** Thrown by mergeStoredIdentity on malformed input; the route maps it to 400. */
export class ConfigValidationError extends Error {}

/** Raw client payload for a config save — every field untrusted. */
export interface StoredIdentityInput {
  siteName?: unknown;
  siteUrl?: unknown;
  discord?: {
    clientId?: unknown;
    guildId?: unknown;
    publicKey?: unknown;
    clientSecret?: unknown;
    botToken?: unknown;
  };
}

function trimmed(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Validate a config update and merge it onto what's stored. Semantics:
 *  - Non-secret fields are stored as given; a blank clears the override (so the
 *    env value shows through again). Blanks are harmless — loadConfig() skips
 *    empty strings.
 *  - Secret fields (clientSecret, botToken) are write-only from the UI: the form
 *    only ever knows whether one is set, never its value. A non-empty value
 *    replaces the stored secret; a blank LEAVES THE EXISTING SECRET INTACT.
 * Malformed non-empty ids/keys throw ConfigValidationError rather than silently
 * corrupting the config.
 */
export function mergeStoredIdentity(
  existing: StoredIdentity,
  incoming: StoredIdentityInput,
): StoredIdentity {
  const inD = incoming.discord ?? {};
  const exD = existing.discord ?? {};

  const siteName = trimmed(incoming.siteName, 80);
  const siteUrl = trimmed(incoming.siteUrl, 200);
  if (siteUrl && !/^https?:\/\//i.test(siteUrl)) {
    throw new ConfigValidationError('Site URL must start with http:// or https://.');
  }

  const clientId = trimmed(inD.clientId, 40);
  const guildId = trimmed(inD.guildId, 40);
  const publicKey = trimmed(inD.publicKey, 100);

  const snowflakeOk = (v: string) => v === '' || /^\d{5,25}$/.test(v);
  if (!snowflakeOk(clientId)) throw new ConfigValidationError('Discord Client ID must be numeric.');
  if (!snowflakeOk(guildId)) throw new ConfigValidationError('Discord Server (Guild) ID must be numeric.');
  if (!(publicKey === '' || /^[0-9a-fA-F]{64}$/.test(publicKey))) {
    throw new ConfigValidationError('Discord Public Key must be 64 hexadecimal characters.');
  }

  // Secrets: only overwrite when a fresh non-empty value arrives.
  const clientSecretIn = trimmed(inD.clientSecret, 200);
  const botTokenIn = trimmed(inD.botToken, 200);

  return {
    siteName,
    siteUrl,
    discord: {
      clientId,
      guildId,
      publicKey,
      clientSecret: clientSecretIn || exD.clientSecret || '',
      botToken: botTokenIn || exD.botToken || '',
    },
  };
}
