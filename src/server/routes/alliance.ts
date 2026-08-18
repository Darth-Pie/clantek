/**
 * Alliance federation routes.
 *
 * `/inbound` is PUBLIC but authenticated by an alliance token (not a session): an
 * allied org's instance calls it to hand us a broadcast, which we sanitize and
 * post to our own Discord via our own bot. It NEVER re-fans-out (loop prevention).
 *
 * The `/links` + `/test` routes are the admin surface (alliance.manage): pair with
 * an ally, mint the token they'll use to call us, and fire a test broadcast.
 * Secrets (the outbound token, the inbound hash) are never echoed back — presence
 * only. A freshly minted inbound token is returned exactly once, at creation.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { cleanBaseUrl, sanitizeBroadcast } from '../../shared/alliance';
import {
  mintAllianceToken,
  resolveInboundLink,
  postBroadcastLocally,
  makeBroadcast,
  fanOut,
} from '../alliance/federation';

const alliance = new Hono<AppContext>();

/** Admin-safe projection of a link — no secrets, presence flags only. */
function view(r: typeof s.allianceLinks.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.baseUrl,
    channelId: r.channelId,
    enabled: r.enabled,
    hasOutbound: !!r.outboundToken,
    inboundPrefix: r.inboundTokenPrefix,
    lastInboundAt: r.lastInboundAt,
  };
}

const now = () => Math.floor(Date.now() / 1000);
const cleanChannel = (v: unknown) => (typeof v === 'string' && /^\d{5,25}$/.test(v) ? v : null);

/* ------------------------------------------------------------------ *
 * INBOUND — an ally hands us a broadcast. Auth = the alliance token WE issued
 * them (matched by hash). Public route; does its own token check.
 * ------------------------------------------------------------------ */
alliance.post('/inbound', async (c) => {
  const authz = c.req.header('authorization') ?? '';
  const token = /^bearer /i.test(authz) ? authz.slice(7).trim() : '';
  const link = await resolveInboundLink(db(c.env), token);
  if (!link) return c.json({ ok: false, error: 'unauthorized' }, 401);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid json' }, 400);
  }
  const broadcast = sanitizeBroadcast(payload);
  if (!broadcast) return c.json({ ok: false, error: 'empty broadcast' }, 422);

  // Post to OUR Discord via OUR bot. Deliberately does NOT fan out again.
  const posted = await postBroadcastLocally(c.env, db(c.env), link, broadcast).catch(() => false);
  await db(c.env)
    .update(s.allianceLinks)
    .set({ lastInboundAt: now() })
    .where(eq(s.allianceLinks.id, link.id))
    .catch(() => {});

  return c.json({ ok: true, posted });
});

/* ------------------------------------------------------------------ *
 * ADMIN — manage links + send a test. alliance.manage.
 * ------------------------------------------------------------------ */
alliance.get('/links', requirePermission('alliance.manage'), async (c) => {
  const rows = await db(c.env).query.allianceLinks.findMany();
  return c.json({ links: rows.map(view) });
});

alliance.post('/links', requirePermission('alliance.manage'), async (c) => {
  const viewer = c.get('viewer')!;
  const body = await c.req.json<{ name?: unknown; baseUrl?: unknown; outboundToken?: unknown; channelId?: unknown }>();

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const baseUrl = cleanBaseUrl(body.baseUrl);
  if (!name || !baseUrl) return c.json({ error: 'A name and a valid https base URL are required.' }, 400);

  const outboundToken = typeof body.outboundToken === 'string' ? body.outboundToken.trim().slice(0, 200) : '';
  const minted = await mintAllianceToken();

  const inserted = await db(c.env)
    .insert(s.allianceLinks)
    .values({
      name,
      baseUrl,
      outboundToken: outboundToken || null,
      channelId: cleanChannel(body.channelId),
      inboundTokenHash: minted.hash,
      inboundTokenPrefix: minted.prefix,
      createdBy: viewer.id,
    })
    .returning();

  // The raw inbound token is shown ONCE — the admin sends it to the ally so they
  // can call us. It's never retrievable again (only its hash is stored).
  return c.json({ link: view(inserted[0]!), inboundToken: minted.token });
});

alliance.patch('/links/:id', requirePermission('alliance.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: unknown; baseUrl?: unknown; outboundToken?: unknown; channelId?: unknown; enabled?: unknown }>();

  const patch: Partial<typeof s.allianceLinks.$inferInsert> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
  if (body.baseUrl !== undefined) {
    const u = cleanBaseUrl(body.baseUrl);
    if (u) patch.baseUrl = u;
  }
  if (body.outboundToken !== undefined) {
    patch.outboundToken = typeof body.outboundToken === 'string' && body.outboundToken.trim()
      ? body.outboundToken.trim().slice(0, 200)
      : null;
  }
  if (body.channelId !== undefined) patch.channelId = cleanChannel(body.channelId);
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;

  if (Object.keys(patch).length) {
    await db(c.env).update(s.allianceLinks).set(patch).where(eq(s.allianceLinks.id, id));
  }
  const row = await db(c.env).query.allianceLinks.findFirst({ where: eq(s.allianceLinks.id, id) });
  return c.json({ link: row ? view(row) : null });
});

/** Regenerate the inbound token an ally uses to call us (invalidates the old one). */
alliance.post('/links/:id/rotate', requirePermission('alliance.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const minted = await mintAllianceToken();
  await db(c.env)
    .update(s.allianceLinks)
    .set({ inboundTokenHash: minted.hash, inboundTokenPrefix: minted.prefix })
    .where(eq(s.allianceLinks.id, id));
  return c.json({ inboundToken: minted.token, prefix: minted.prefix });
});

alliance.delete('/links/:id', requirePermission('alliance.manage'), async (c) => {
  await db(c.env).delete(s.allianceLinks).where(eq(s.allianceLinks.id, Number(c.req.param('id'))));
  return c.json({ ok: true });
});

/** Fire a test broadcast out to every enabled ally (verifies the whole pipe). */
alliance.post('/test', requirePermission('alliance.manage'), async (c) => {
  const b = await makeBroadcast(
    c.env,
    'test',
    'Alliance test',
    'This is a test alliance broadcast. If you can see it, cross-org federation is working.',
  );
  c.executionCtx.waitUntil(fanOut(c.env, b));
  return c.json({ ok: true });
});

export default alliance;
