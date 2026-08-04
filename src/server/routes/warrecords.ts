/**
 * War records — the catalog of awardable "items of pride".
 *
 * A definition is a name, optional description/image, and an optional game it
 * belongs to. Awarding one to a member lives with the other member-scoped
 * actions in routes/members.ts, mirroring how medals work.
 */

import { Hono } from 'hono';
import { asc, eq, sql } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { deleteMediaByUrl } from './media';

const warrecords = new Hono<AppContext>();

/** Every war record, with its game (if any) and how many members hold it. */
warrecords.get('/', requireAuth, async (c) => {
  const rows = await db(c.env)
    .select({
      id: s.warRecords.id,
      name: s.warRecords.name,
      description: s.warRecords.description,
      imageUrl: s.warRecords.imageUrl,
      gameId: s.warRecords.gameId,
      gameName: s.games.name,
      sortOrder: s.warRecords.sortOrder,
      awardCount: sql<number>`(select count(*) from member_war_records where member_war_records.war_record_id = war_records.id)`,
    })
    .from(s.warRecords)
    .leftJoin(s.games, eq(s.warRecords.gameId, s.games.id))
    .orderBy(asc(s.warRecords.sortOrder), asc(s.warRecords.name));

  return c.json({ warRecords: rows });
});

warrecords.post('/', requirePermission('warrecords.manage'), async (c) => {
  const body = await c.req.json<{
    name?: string;
    description?: string;
    imageUrl?: string;
    gameId?: number | null;
  }>();
  if (!body.name?.trim()) return c.json({ error: 'A name is required' }, 400);

  const database = db(c.env);
  const highest = await database
    .select({ max: sql<number | null>`max(${s.warRecords.sortOrder})` })
    .from(s.warRecords);

  const created = (
    await database
      .insert(s.warRecords)
      .values({
        name: body.name.trim().slice(0, 120),
        description: body.description?.trim() || null,
        imageUrl: body.imageUrl?.trim() || null,
        gameId: body.gameId ?? null,
        sortOrder: (highest[0]?.max ?? -1) + 1,
      })
      .returning()
  )[0]!;

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'warrecord.create',
    targetType: 'war_record',
    targetId: String(created.id),
    meta: { name: created.name },
  });

  return c.json({ warRecord: { ...created, awardCount: 0 } }, 201);
});

warrecords.patch('/:id', requirePermission('warrecords.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    name?: string;
    description?: string | null;
    imageUrl?: string | null;
    gameId?: number | null;
  }>();

  const database = db(c.env);
  const record = await database.query.warRecords.findFirst({ where: eq(s.warRecords.id, id) });
  if (!record) return c.json({ error: 'No such war record' }, 404);

  const patch: Partial<typeof s.warRecords.$inferInsert> = {};
  if (body.name != null) {
    if (!body.name.trim()) return c.json({ error: 'Name cannot be empty' }, 400);
    patch.name = body.name.trim().slice(0, 120);
  }
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.imageUrl !== undefined) {
    patch.imageUrl = body.imageUrl?.trim() || null;
    if (patch.imageUrl !== record.imageUrl) c.executionCtx.waitUntil(deleteMediaByUrl(c.env, record.imageUrl));
  }
  if (body.gameId !== undefined) patch.gameId = body.gameId ?? null;

  const updated = (await database.update(s.warRecords).set(patch).where(eq(s.warRecords.id, id)).returning())[0]!;

  const awardCount = (
    await database
      .select({ n: sql<number>`count(*)` })
      .from(s.memberWarRecords)
      .where(eq(s.memberWarRecords.warRecordId, id))
  )[0]!.n;

  return c.json({ warRecord: { ...updated, awardCount } });
});

warrecords.delete('/:id', requirePermission('warrecords.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const database = db(c.env);
  const record = await database.query.warRecords.findFirst({ where: eq(s.warRecords.id, id) });
  if (!record) return c.json({ error: 'No such war record' }, 404);

  await database.delete(s.warRecords).where(eq(s.warRecords.id, id));
  c.executionCtx.waitUntil(deleteMediaByUrl(c.env, record.imageUrl));

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'warrecord.delete',
    targetType: 'war_record',
    targetId: String(id),
    meta: { name: record.name },
  });

  return c.json({ ok: true });
});

export default warrecords;
