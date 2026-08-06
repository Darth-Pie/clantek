/**
 * Star Citizen hangar — import + read, gated on the SC module being enabled.
 *
 * A member imports their OWN hangar (PUT, from a bookmarklet paste). Viewing
 * SOMEONE ELSE'S hangar takes two things: the viewer must hold `hangar.view`,
 * AND that member must have opted their hangar public (self-service, any
 * rank/role). Owners always see their own. When the module is off, every route
 * 404s so nothing leaks.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth } from '../middleware/auth';
import { loadModules } from '../modules';
import { sanitizeHangar } from '../../shared/hangar';
import { can } from '../../shared/permissions';

const hangar = new Hono<AppContext>();

/** Star Citizen module enabled for this install? */
async function scEnabled(env: AppContext['Bindings']): Promise<boolean> {
  return (await loadModules(env, db(env))).starcitizen;
}

/**
 * A member's stored hangar — subject to visibility. Owners always get theirs
 * (with the public flag so their toggle reflects state); others get it only
 * with `hangar.view` AND when the owner has shared it. `canView`/`isPublic` let
 * the client explain an empty result ("private") without leaking the contents.
 */
hangar.get('/:userId', requireAuth, async (c) => {
  if (!(await scEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const userId = Number(c.req.param('userId'));
  const self = viewer.id === userId;

  // A member with no view permission never sees another member's hangar.
  if (!self && !can(viewer, 'hangar.view')) {
    return c.json({ hangar: null, self: false, canView: false, isPublic: false });
  }

  const row = await db(c.env).query.scHangars.findFirst({ where: eq(s.scHangars.userId, userId) });
  const isPublic = !!row?.isPublic;
  const allowed = self || isPublic; // permission already confirmed above
  return c.json({
    hangar: allowed && row ? { items: row.items, itemCount: row.itemCount, importedAt: row.importedAt } : null,
    self,
    canView: allowed,
    isPublic,
  });
});

/** The signed-in member's own hangar sharing state (for their toggle). */
hangar.get('/me/visibility', requireAuth, async (c) => {
  if (!(await scEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const row = await db(c.env).query.scHangars.findFirst({ where: eq(s.scHangars.userId, viewer.id) });
  return c.json({ hasHangar: !!row, isPublic: !!row?.isPublic });
});

/** Set whether the signed-in member's own hangar is shared (self-service). */
hangar.patch('/visibility', requireAuth, async (c) => {
  if (!(await scEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const body = await c.req.json<{ public?: unknown }>().catch(() => ({}) as { public?: unknown });
  const isPublic = body.public === true;
  await db(c.env).update(s.scHangars).set({ isPublic }).where(eq(s.scHangars.userId, viewer.id));
  return c.json({ ok: true, isPublic });
});

/** Import (replace) the signed-in member's hangar. */
hangar.put('/', requireAuth, async (c) => {
  if (!(await scEnabled(c.env))) return c.json({ error: 'Module not enabled.' }, 404);
  const viewer = c.get('viewer')!;
  const body = await c.req.json<{ items?: unknown }>().catch(() => ({}) as { items?: unknown });
  const items = sanitizeHangar(body.items);
  if (!items.length) {
    return c.json({ error: 'No hangar items found in that paste — re-copy from your RSI hangar.' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  await db(c.env)
    .insert(s.scHangars)
    .values({ userId: viewer.id, items, itemCount: items.length, importedAt: now })
    .onConflictDoUpdate({
      target: s.scHangars.userId,
      set: { items, itemCount: items.length, importedAt: now },
    });

  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'hangar.import',
    targetType: 'user',
    targetId: String(viewer.id),
    meta: { itemCount: items.length },
  });

  return c.json({ ok: true, itemCount: items.length });
});

/** Clear the signed-in member's own hangar. */
hangar.delete('/', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  await db(c.env).delete(s.scHangars).where(eq(s.scHangars.userId, viewer.id));
  return c.json({ ok: true });
});

export default hangar;
