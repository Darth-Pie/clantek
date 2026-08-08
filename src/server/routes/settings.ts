import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext, Env } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { loadModules, cleanModuleFlags, MODULES_KEY, loadScConfig, cleanScConfig, SC_KEY } from '../modules';
import { loadFooter, FOOTER_KEY } from '../footer';
import { cleanFooter } from '../../shared/footer';
import { loadPageAccess, PAGE_ACCESS_KEY } from '../pageAccess';
import { cleanPageAccess } from '../../shared/pageAccess';
import { mergeSeo, SEO_KEY, type StoredSeo } from '../seo';
import {
  loadConfig,
  loadAnalytics,
  discordClient,
  mergeStoredIdentity,
  mergeStoredAnalytics,
  ConfigValidationError,
  IDENTITY_KEY,
  ANALYTICS_KEY,
  type StoredIdentity,
  type StoredIdentityInput,
  type StoredAnalytics,
  type StoredAnalyticsInput,
} from '../config';
import {
  loadAnnouncementConfig,
  DEFAULT_ANNOUNCEMENTS,
  type AnnouncementConfig,
  type AnnouncementEventKey,
} from '../discord/announce';
import { fetchRates } from './usage';

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

/* ------------------------------------------------------------------ *
 * Game modules — which optional features (Star Citizen, …) are enabled.
 * Any signed-in member may read the flags (to show/hide module UI); only
 * settings.manage may change them.
 * ------------------------------------------------------------------ */

settings.get('/modules', requireAuth, async (c) => {
  return c.json({ modules: await loadModules(c.env, db(c.env)) });
});

settings.put('/modules', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ modules?: unknown }>();
  const clean = cleanModuleFlags(body.modules);
  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: MODULES_KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });
  return c.json({ ok: true, modules: clean });
});

/* ------------------------------------------------------------------ *
 * Star Citizen module config (org SID for account verification). Readable by
 * any signed-in member; only settings.manage may change it.
 * ------------------------------------------------------------------ */

settings.get('/sc', requireAuth, async (c) => {
  return c.json({ sc: await loadScConfig(c.env, db(c.env)) });
});

settings.put('/sc', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ sc?: unknown }>();
  const clean = cleanScConfig(body.sc);
  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: SC_KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });
  return c.json({ ok: true, sc: clean });
});

/* ------------------------------------------------------------------ *
 * Site footer — shown on every page. GET is public (the footer renders on the
 * logged-out login page too); only settings.manage may change it.
 * ------------------------------------------------------------------ */

settings.get('/footer', async (c) => {
  return c.json({ footer: await loadFooter(c.env, db(c.env)) });
});

settings.put('/footer', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ footer?: unknown }>();
  const clean = cleanFooter(body.footer);
  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: FOOTER_KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });
  return c.json({ ok: true, footer: clean });
});

/* ------------------------------------------------------------------ *
 * Built-in content-page visibility (News/Roster/Events). Public/Members per
 * page — the parallel to a layout page's isPublic flag. Read by any signed-in
 * member (the Pages editor shows the toggles); changed by whoever arranges pages
 * (pages.manage), consistent with the home-page public toggle.
 * ------------------------------------------------------------------ */

settings.get('/page-access', requireAuth, async (c) => {
  return c.json({ pageAccess: await loadPageAccess(c.env, db(c.env)) });
});

/* ------------------------------------------------------------------ *
 * Demo / preview mode. When on, a pending applicant gets read-only visibility
 * into members-only content + the content/people admin panels (writes still
 * blocked). Off by default — this is the mustr.gg showcase switch, never the
 * sellable product's default. Read by any member; changed by settings.manage.
 * ------------------------------------------------------------------ */

settings.get('/demo', requireAuth, async (c) => {
  const row = await db(c.env).query.settings.findFirst({ where: eq(s.settings.key, 'demo') });
  const v = row?.value as { pendingPreview?: unknown } | undefined;
  return c.json({ demo: { pendingPreview: !!(v && typeof v === 'object' && v.pendingPreview === true) } });
});

settings.put('/demo', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ demo?: { pendingPreview?: unknown } }>();
  const clean = { pendingPreview: body.demo?.pendingPreview === true };
  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: 'demo', value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });
  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'settings.demo',
    targetType: 'settings',
    targetId: 'demo',
    meta: clean,
  });
  return c.json({ ok: true, demo: clean });
});

settings.put('/page-access', requirePermission('pages.manage'), async (c) => {
  const body = await c.req.json<{ pageAccess?: unknown }>();
  const clean = cleanPageAccess(body.pageAccess);
  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: PAGE_ACCESS_KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });
  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'settings.page_access',
    targetType: 'settings',
    targetId: PAGE_ACCESS_KEY,
    meta: clean,
  });
  return c.json({ ok: true, pageAccess: clean });
});

/* ------------------------------------------------------------------ *
 * SEO & sharing — the settings-driven <head> the Worker injects (title,
 * description, Open Graph, Twitter, robots, verification, JSON-LD). The site
 * name/URL themselves live in Identity & Discord; shown here for reference.
 * ------------------------------------------------------------------ */

settings.get('/seo', requirePermission('settings.manage'), async (c) => {
  const row = await db(c.env).query.settings.findFirst({ where: eq(s.settings.key, SEO_KEY) });
  const cfg = await loadConfig(c.env, db(c.env));
  return c.json({
    seo: (row?.value as StoredSeo | undefined) ?? {},
    site: { name: cfg.siteName, url: cfg.siteUrl },
  });
});

settings.put('/seo', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ seo?: unknown }>();
  const clean = mergeSeo(body.seo);
  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: SEO_KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });
  return c.json({ ok: true, seo: clean });
});

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
    faviconUrl: cleanLogoUrl((site ?? {}).faviconUrl),
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
          title: '✅ mustr announcements are working',
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

/* ------------------------------------------------------------------ *
 * Analytics — the Cloudflare account/token/script/db the usage dashboard
 * queries for live request & query rates. DB-over-env like identity; the API
 * token is write-only (returned as a presence boolean, never its value).
 * ------------------------------------------------------------------ */

/** Effective analytics config for the admin UI — the token becomes presence only. */
function analyticsView(cfg: Awaited<ReturnType<typeof loadAnalytics>>) {
  return {
    accountId: cfg.accountId,
    scriptName: cfg.scriptName,
    d1DatabaseId: cfg.d1DatabaseId,
    apiTokenSet: cfg.apiToken !== '',
  };
}

settings.get('/analytics', requirePermission('settings.manage'), async (c) => {
  return c.json({ analytics: analyticsView(await loadAnalytics(c.env, db(c.env))) });
});

settings.put('/analytics', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ analytics?: StoredAnalyticsInput }>();

  const existingRow = await db(c.env).query.settings.findFirst({
    where: eq(s.settings.key, ANALYTICS_KEY),
  });
  const existing = (existingRow?.value as StoredAnalytics | undefined) ?? {};

  let clean: StoredAnalytics;
  try {
    clean = mergeStoredAnalytics(existing, body.analytics ?? {});
  } catch (err) {
    if (err instanceof ConfigValidationError) return c.json({ error: err.message }, 400);
    throw err;
  }

  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: ANALYTICS_KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });

  return c.json({ ok: true, analytics: analyticsView(await loadAnalytics(c.env, db(c.env))) });
});

/** Actually query the Analytics API so the operator sees whether their token works. */
settings.post('/analytics/test', requirePermission('settings.manage'), async (c) => {
  const cfg = await loadAnalytics(c.env, db(c.env));
  if (!cfg.apiToken || !cfg.accountId) {
    return c.json({ ok: false, error: 'Set the Account ID and API token first.' }, 400);
  }
  const { rates, error } = await fetchRates(cfg);
  if (error) return c.json({ ok: false, error }, 502);
  return c.json({ ok: true, requests: rates?.workersRequests.used ?? 0 });
});

export default settings;
