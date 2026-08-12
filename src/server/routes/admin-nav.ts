/**
 * Admin menu arrangement — the optional order/label override for the admin
 * sidebar (see shared/adminNav.ts for the model).
 *
 * Stored as one JSON blob in settings['adminNav']. GET only needs an authenticated
 * viewer: the blob is pure arrangement (keys, order, labels), never a capability,
 * and the sidebar renderer filters every item by the viewer's permissions anyway —
 * so, like the site nav, an arrangement can only ever *reorder doors the viewer may
 * already open*. PUT/DELETE are gated on `settings.manage` — the same bar as the
 * rest of the install's settings. When nothing is stored, GET returns null and the
 * client falls back to the code-defined tree.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { sanitizeAdminNav, type AdminNavOverride } from '../../shared/adminNav';

const adminNav = new Hono<AppContext>();

const KEY = 'adminNav';

async function load(database: ReturnType<typeof db>): Promise<AdminNavOverride | null> {
  const row = await database.query.settings.findFirst({ where: eq(s.settings.key, KEY) });
  if (row?.value && typeof row.value === 'object') return sanitizeAdminNav(row.value);
  return null;
}

/** The current arrangement (or null). Any signed-in viewer — the sidebar needs it. */
adminNav.get('/', requireAuth, async (c) => {
  return c.json({ override: await load(db(c.env)) });
});

/** Save the arranged menu. */
adminNav.put('/', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ override?: unknown }>();
  const clean = sanitizeAdminNav(body.override);

  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });

  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'adminNav.update',
    targetType: 'settings',
    targetId: KEY,
    meta: { groups: clean.groups.length },
  });

  return c.json({ ok: true, override: clean });
});

/** Reset to the code-defined default (removes the stored arrangement). */
adminNav.delete('/', requirePermission('settings.manage'), async (c) => {
  const viewer = c.get('viewer')!;
  await db(c.env).delete(s.settings).where(eq(s.settings.key, KEY));
  await db(c.env).insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'adminNav.reset',
    targetType: 'settings',
    targetId: KEY,
  });
  return c.json({ ok: true, override: null });
});

export default adminNav;
