/**
 * The medal catalog — the definitions, not the awards.
 *
 * Awarding and revoking a medal on a specific member lives with the other
 * member-scoped actions in routes/members.ts (mirroring how role grants do).
 * A medal with autoGrantMonths set is handed out automatically by the tenure
 * sweep (server/medals/tenure.ts); it can still be awarded by hand as well.
 */

import { Hono } from 'hono';
import { asc, eq, sql } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { deleteMediaByUrl } from './media';

const medals = new Hono<AppContext>();

/** NULL, or a positive whole number of months. Anything else is a 400. */
function parseAutoGrantMonths(v: unknown): number | null | undefined {
  if (v === undefined) return undefined; // field omitted — leave unchanged
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Auto-grant months must be a positive whole number.');
  return n;
}

/** Every medal, with how many members hold it. Visible to any signed-in member. */
medals.get('/', requireAuth, async (c) => {
  const rows = await db(c.env)
    .select({
      id: s.medals.id,
      name: s.medals.name,
      description: s.medals.description,
      imageUrl: s.medals.imageUrl,
      gameId: s.medals.gameId,
      autoGrantMonths: s.medals.autoGrantMonths,
      sortOrder: s.medals.sortOrder,
      awardCount: sql<number>`(select count(*) from member_medals where member_medals.medal_id = medals.id)`,
    })
    .from(s.medals)
    .orderBy(asc(s.medals.sortOrder), asc(s.medals.name));

  return c.json({ medals: rows });
});

medals.post('/', requirePermission('medals.manage'), async (c) => {
  const body = await c.req.json<{
    name: string;
    description?: string;
    imageUrl?: string;
    autoGrantMonths?: number | null;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);

  let autoGrantMonths: number | null;
  try {
    autoGrantMonths = parseAutoGrantMonths(body.autoGrantMonths) ?? null;
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const database = db(c.env);
  const highest = await database
    .select({ max: sql<number | null>`max(${s.medals.sortOrder})` })
    .from(s.medals);

  const created = (
    await database
      .insert(s.medals)
      .values({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        imageUrl: body.imageUrl?.trim() || null,
        autoGrantMonths,
        sortOrder: (highest[0]?.max ?? -1) + 1,
      })
      .returning()
  )[0]!;

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'medal.create',
    targetType: 'medal',
    targetId: String(created.id),
    meta: { name: created.name, autoGrantMonths },
  });

  return c.json({ medal: { ...created, awardCount: 0 } }, 201);
});

medals.patch('/:id', requirePermission('medals.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    name?: string;
    description?: string | null;
    imageUrl?: string | null;
    autoGrantMonths?: number | null;
  }>();

  const database = db(c.env);
  const medal = await database.query.medals.findFirst({ where: eq(s.medals.id, id) });
  if (!medal) return c.json({ error: 'No such medal' }, 404);

  const patch: Partial<typeof s.medals.$inferInsert> = {};
  if (body.name != null) {
    if (!body.name.trim()) return c.json({ error: 'Name cannot be empty' }, 400);
    patch.name = body.name.trim();
  }
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.imageUrl !== undefined) {
    patch.imageUrl = body.imageUrl?.trim() || null;
    // Free the object the image is replacing, once the update has committed.
    if (patch.imageUrl !== medal.imageUrl) {
      c.executionCtx.waitUntil(deleteMediaByUrl(c.env, medal.imageUrl));
    }
  }
  if (body.autoGrantMonths !== undefined) {
    try {
      patch.autoGrantMonths = parseAutoGrantMonths(body.autoGrantMonths) ?? null;
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  }

  const updated = (await database.update(s.medals).set(patch).where(eq(s.medals.id, id)).returning())[0]!;

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'medal.update',
    targetType: 'medal',
    targetId: String(id),
    meta: patch,
  });

  const awardCount = (
    await database
      .select({ n: sql<number>`count(*)` })
      .from(s.memberMedals)
      .where(eq(s.memberMedals.medalId, id))
  )[0]!.n;

  return c.json({ medal: { ...updated, awardCount } });
});

/** Delete a medal definition. Every award of it is cascaded away (see schema). */
medals.delete('/:id', requirePermission('medals.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const database = db(c.env);

  const medal = await database.query.medals.findFirst({ where: eq(s.medals.id, id) });
  if (!medal) return c.json({ error: 'No such medal' }, 404);

  await database.delete(s.medals).where(eq(s.medals.id, id));
  c.executionCtx.waitUntil(deleteMediaByUrl(c.env, medal.imageUrl));

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'medal.delete',
    targetType: 'medal',
    targetId: String(id),
    meta: { name: medal.name },
  });

  return c.json({ ok: true });
});

export default medals;
