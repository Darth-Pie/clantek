import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext, Env } from '../env';
import { db, requirePermission } from '../middleware/auth';
import {
  loadConfig,
  discordClient,
  mergeStoredIdentity,
  ConfigValidationError,
  IDENTITY_KEY,
  type StoredIdentity,
  type StoredIdentityInput,
} from '../config';
import {
  loadAnnouncementConfig,
  DEFAULT_ANNOUNCEMENTS,
  type AnnouncementConfig,
  type AnnouncementEventKey,
} from '../discord/announce';

const settings = new Hono<AppContext>();

/** Bot client from resolved (DB-over-env) config, or null when unconfigured. */
const rest = (env: Env) => discordClient(env);

/** Effective identity for the admin UI — secret values become presence booleans. */
function identityView(cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    siteName: cfg.siteName,
    siteUrl: cfg.siteUrl,
    discord: {
      clientId: cfg.discord.clientId,
      guildId: cfg.discord.guildId,
      publicKey: cfg.discord.publicKey,
      clientSecretSet: cfg.discord.clientSecret !== '',
      botTokenSet: cfg.discord.botToken !== '',
    },
  };
}

/** Public — the theme has to load before anyone signs in. */
settings.get('/theme', async (c) => {
  const row = await db(c.env).query.settings.findFirst({ where: eq(s.settings.key, 'theme') });
  return c.json({ theme: (row?.value as Record<string, string>) ?? {} });
});

settings.put('/theme', requirePermission('theme.manage'), async (c) => {
  const { theme } = await c.req.json<{ theme: Record<string, string> }>();

  // Only CSS custom properties are storable, so a rogue key cannot become a
  // selector or a declaration when the client applies these.
  const clean = Object.fromEntries(
    Object.entries(theme ?? {}).filter(
      ([k, v]) => k.startsWith('--') && typeof v === 'string' && !v.includes('}'),
    ),
  );

  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: 'theme', value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });

  return c.json({ ok: true, theme: clean });
});

settings.get('/site', async (c) => {
  const row = await db(c.env).query.settings.findFirst({ where: eq(s.settings.key, 'site') });
  return c.json({ site: row?.value ?? {} });
});

/**
 * Accept only a same-origin ("/media/…") or absolute http(s) logo URL; anything
 * else — javascript:, data:, protocol-relative — becomes empty, so a stored logo
 * URL can never smuggle a script into the header <img src>.
 */
function cleanLogoUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  if (!t) return '';
  if (t.startsWith('/') && !t.startsWith('//')) return t.slice(0, 500);
  if (/^https?:\/\//i.test(t)) return t.slice(0, 500);
  return '';
}

settings.put('/site', requirePermission('settings.manage'), async (c) => {
  const { site } = await c.req.json<{ site: Record<string, unknown> }>();
  const viewer = c.get('viewer')!;

  // Store only the known branding fields, validated — never the raw payload.
  const size = Math.round(Number((site ?? {}).logoSize));
  const clean = {
    logoUrl: cleanLogoUrl((site ?? {}).logoUrl),
    logoSize: Number.isFinite(size) ? Math.min(200, Math.max(40, size)) : 88,
  };

  await db(c.env)
    .insert(s.settings)
    .values({ key: 'site', value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });

  return c.json({ ok: true, site: clean });
});

/* ------------------------------------------------------------------ *
 * Discord announcements
 * ------------------------------------------------------------------ */

/** The text/announcement channels the bot can see, for the picker. */
settings.get('/discord-channels', requirePermission('settings.manage'), async (c) => {
  const client = await rest(c.env);
  if (!client) return c.json({ channels: [], warning: 'The Discord bot is not configured.' });
  try {
    return c.json({ channels: await client.listTextChannels() });
  } catch (err) {
    return c.json({ channels: [], warning: `Could not load channels: ${(err as Error).message}` });
  }
});

settings.get('/announcements', requirePermission('settings.manage'), async (c) => {
  return c.json({ announcements: await loadAnnouncementConfig(db(c.env)) });
});

settings.put('/announcements', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<Partial<AnnouncementConfig>>();

  // Only keep the known event flags as booleans, and a plain channel id string.
  const events = {} as AnnouncementConfig['events'];
  for (const key of Object.keys(DEFAULT_ANNOUNCEMENTS.events) as AnnouncementEventKey[]) {
    events[key] = Boolean(body.events?.[key]);
  }
  const channelId =
    typeof body.channelId === 'string' && /^\d+$/.test(body.channelId) ? body.channelId : null;
  const clean: AnnouncementConfig = { channelId, events };

  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: 'announcements', value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });

  return c.json({ ok: true, announcements: clean });
});

/** Post a test message to a channel, to confirm the bot can actually reach it. */
settings.post('/announcements/test', requirePermission('settings.manage'), async (c) => {
  const { channelId } = await c.req.json<{ channelId?: string }>();
  if (!channelId || !/^\d+$/.test(channelId)) return c.json({ error: 'Choose a channel first.' }, 400);

  const client = await rest(c.env);
  if (!client) return c.json({ error: 'The Discord bot is not configured.' }, 503);

  try {
    await client.createMessage(channelId, {
      embeds: [
        {
          color: 0x5865f2,
          title: '✅ ClanTek announcements are working',
          description: 'This is a test message. Award a medal or promote someone to see the real thing.',
        },
      ],
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: `Discord refused the message: ${(err as Error).message}` }, 502);
  }
});

/* ------------------------------------------------------------------ *
 * Identity & Discord — the config layer that lets an operator point this
 * install at their own Discord app + domain from the UI, instead of editing
 * wrangler.jsonc. DB-over-env: what's saved here wins; blanks fall back to the
 * wrangler vars/secrets. Secret VALUES are never returned — only presence.
 * ------------------------------------------------------------------ */

settings.get('/identity', requirePermission('settings.manage'), async (c) => {
  const cfg = await loadConfig(c.env, db(c.env));
  return c.json({
    identity: identityView(cfg),
    // The exact URLs to paste into the Discord Developer Portal for THIS origin,
    // so the operator never has to hand-assemble them.
    urls: {
      redirectUri: new URL('/api/auth/callback', c.req.url).toString(),
      interactionsUrl: new URL('/api/discord/interactions', c.req.url).toString(),
    },
  });
});

settings.put('/identity', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ identity?: StoredIdentityInput }>();

  // Merge onto the stored blob so blank secret fields keep the existing secret.
  const existingRow = await db(c.env).query.settings.findFirst({
    where: eq(s.settings.key, IDENTITY_KEY),
  });
  const existing = (existingRow?.value as StoredIdentity | undefined) ?? {};

  let clean: StoredIdentity;
  try {
    clean = mergeStoredIdentity(existing, body.identity ?? {});
  } catch (err) {
    if (err instanceof ConfigValidationError) return c.json({ error: err.message }, 400);
    throw err;
  }

  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: IDENTITY_KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });

  return c.json({ ok: true, identity: identityView(await loadConfig(c.env, db(c.env))) });
});

/** Prove the currently-configured bot token + Server ID actually work. */
settings.post('/identity/test', requirePermission('settings.manage'), async (c) => {
  const client = await discordClient(c.env, db(c.env));
  if (!client) return c.json({ ok: false, error: 'Bot token or Server (Guild) ID is not set.' }, 400);
  try {
    const channels = await client.listTextChannels();
    return c.json({ ok: true, channelCount: channels.length });
  } catch (err) {
    return c.json({ ok: false, error: `Discord rejected the bot: ${(err as Error).message}` }, 502);
  }
});

export default settings;
