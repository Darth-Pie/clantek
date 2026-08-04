import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext, Env } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { DiscordRest } from '../discord/rest';
import {
  loadAnnouncementConfig,
  DEFAULT_ANNOUNCEMENTS,
  type AnnouncementConfig,
  type AnnouncementEventKey,
} from '../discord/announce';

const settings = new Hono<AppContext>();

function rest(env: Env): DiscordRest | null {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;
  return new DiscordRest(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID);
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

settings.put('/site', requirePermission('settings.manage'), async (c) => {
  const { site } = await c.req.json<{ site: Record<string, unknown> }>();
  const viewer = c.get('viewer')!;

  await db(c.env)
    .insert(s.settings)
    .values({ key: 'site', value: site, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: site, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });

  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Discord announcements
 * ------------------------------------------------------------------ */

/** The text/announcement channels the bot can see, for the picker. */
settings.get('/discord-channels', requirePermission('settings.manage'), async (c) => {
  const client = rest(c.env);
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

  const client = rest(c.env);
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

export default settings;
