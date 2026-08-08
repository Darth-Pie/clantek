/**
 * Training courses — embedded Google Slides that can be required for specific
 * ranks and marked complete per member. Completion is private (a member sees
 * their own; training.view sees anyone's). How a member is marked done depends on
 * the course's completionMode: 'self' (they tick it) or 'officer' (training.manage
 * only). The embed src is always re-derived from the pasted url via resolveSlides,
 * never echoed, so a stored value can't smuggle a foreign iframe.
 */

import { Hono } from 'hono';
import { and, asc, eq, inArray } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { can } from '../../shared/permissions';
import { resolveSlides } from '../../shared/trainingEmbed';

const training = new Hono<AppContext>();

type DB = ReturnType<typeof db>;

/** trainingId → its required rank ids. */
async function requiredRanksFor(database: DB, trainingIds: number[]): Promise<Map<number, number[]>> {
  const m = new Map<number, number[]>();
  if (trainingIds.length === 0) return m;
  const rows = await database
    .select()
    .from(s.trainingRequiredRanks)
    .where(inArray(s.trainingRequiredRanks.trainingId, trainingIds));
  for (const r of rows) {
    const a = m.get(r.trainingId) ?? [];
    a.push(r.rankId);
    m.set(r.trainingId, a);
  }
  return m;
}

/** Replace a course's required-rank set. */
async function setRequiredRanks(database: DB, trainingId: number, rankIds: unknown): Promise<void> {
  await database.delete(s.trainingRequiredRanks).where(eq(s.trainingRequiredRanks.trainingId, trainingId));
  const clean = [...new Set((Array.isArray(rankIds) ? rankIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (clean.length) {
    await database.insert(s.trainingRequiredRanks).values(clean.map((rankId) => ({ trainingId, rankId })));
  }
}

/** The catalog, for the training module — every course + required ranks + the viewer's own completion. */
training.get('/', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  const database = db(c.env);
  const courses = await database.select().from(s.trainings).orderBy(asc(s.trainings.sortOrder), asc(s.trainings.id));
  const ids = courses.map((t) => t.id);
  const reqMap = await requiredRanksFor(database, ids);
  const mine = ids.length
    ? await database
        .select({ trainingId: s.trainingCompletions.trainingId })
        .from(s.trainingCompletions)
        .where(and(eq(s.trainingCompletions.userId, viewer.id), inArray(s.trainingCompletions.trainingId, ids)))
    : [];
  const done = new Set(mine.map((m) => m.trainingId));
  const myRank = viewer.rank?.id ?? -1;

  return c.json({
    trainings: courses.map((t) => {
      const requiredRankIds = reqMap.get(t.id) ?? [];
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        embedUrl: t.embedUrl,
        embedSrc: t.embedSrc,
        provider: t.provider,
        completionMode: t.completionMode,
        sortOrder: t.sortOrder,
        requiredRankIds,
        requiredForMe: requiredRankIds.includes(myRank),
        completed: done.has(t.id),
      };
    }),
  });
});

/** Create a course. */
training.post('/', requirePermission('training.manage'), async (c) => {
  const body = await c.req.json<{
    title?: string;
    description?: string;
    embedUrl?: string;
    completionMode?: string;
    requiredRankIds?: number[];
    sortOrder?: number;
  }>();
  const title = (body.title ?? '').trim().slice(0, 120);
  if (!title) return c.json({ error: 'A title is required.' }, 400);
  const resolved = resolveSlides(body.embedUrl ?? '');
  if (!resolved) return c.json({ error: 'Paste a valid Google Slides link.' }, 400);

  const viewer = c.get('viewer')!;
  const database = db(c.env);
  const nowSec = Math.floor(Date.now() / 1000);
  const inserted = await database
    .insert(s.trainings)
    .values({
      title,
      description: (body.description ?? '').trim().slice(0, 2000) || null,
      embedUrl: (body.embedUrl ?? '').slice(0, 1000),
      embedSrc: resolved.src,
      provider: resolved.provider,
      completionMode: body.completionMode === 'self' ? 'self' : 'officer',
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.round(Number(body.sortOrder)) : 0,
      createdBy: viewer.id,
      createdAt: nowSec,
      updatedAt: nowSec,
    })
    .returning({ id: s.trainings.id });
  const id = inserted[0]!.id;
  await setRequiredRanks(database, id, body.requiredRankIds);

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'training.create',
    targetType: 'training',
    targetId: String(id),
    meta: { title },
  });
  return c.json({ ok: true, id }, 201);
});

/** Edit a course. */
training.patch('/:id', requirePermission('training.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const database = db(c.env);
  const existing = await database.query.trainings.findFirst({ where: eq(s.trainings.id, id) });
  if (!existing) return c.json({ error: 'No such course' }, 404);

  const body = await c.req.json<{
    title?: string;
    description?: string;
    embedUrl?: string;
    completionMode?: string;
    requiredRankIds?: number[];
    sortOrder?: number;
  }>();
  const set: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) };
  if (typeof body.title === 'string' && body.title.trim()) set.title = body.title.trim().slice(0, 120);
  if (typeof body.description === 'string') set.description = body.description.trim().slice(0, 2000) || null;
  if (typeof body.embedUrl === 'string' && body.embedUrl.trim()) {
    const resolved = resolveSlides(body.embedUrl);
    if (!resolved) return c.json({ error: 'Paste a valid Google Slides link.' }, 400);
    set.embedUrl = body.embedUrl.slice(0, 1000);
    set.embedSrc = resolved.src;
    set.provider = resolved.provider;
  }
  if (body.completionMode === 'self' || body.completionMode === 'officer') set.completionMode = body.completionMode;
  if (Number.isFinite(Number(body.sortOrder))) set.sortOrder = Math.round(Number(body.sortOrder));

  await database.update(s.trainings).set(set).where(eq(s.trainings.id, id));
  if (Array.isArray(body.requiredRankIds)) await setRequiredRanks(database, id, body.requiredRankIds);

  const viewer = c.get('viewer')!;
  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'training.update',
    targetType: 'training',
    targetId: String(id),
  });
  return c.json({ ok: true });
});

/** Delete a course (cascades its required-ranks and completions). */
training.delete('/:id', requirePermission('training.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const viewer = c.get('viewer')!;
  const database = db(c.env);
  await database.delete(s.trainings).where(eq(s.trainings.id, id));
  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'training.delete',
    targetType: 'training',
    targetId: String(id),
  });
  return c.json({ ok: true });
});

/** Whether the viewer may change `targetUserId`'s completion of a course. */
function mayMark(viewerId: number, targetUserId: number, mode: string, isManager: boolean): boolean {
  return isManager || (targetUserId === viewerId && mode === 'self');
}

/** Mark a training complete for a member. Body: { userId? } (defaults to self). */
training.post('/:id/complete', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const viewer = c.get('viewer')!;
  const body = await c.req.json<{ userId?: number }>().catch(() => ({}) as { userId?: number });
  const targetUserId = Number.isInteger(body.userId) ? Number(body.userId) : viewer.id;

  const database = db(c.env);
  const course = await database.query.trainings.findFirst({ where: eq(s.trainings.id, id) });
  if (!course) return c.json({ error: 'No such course' }, 404);
  if (!mayMark(viewer.id, targetUserId, course.completionMode, can(viewer, 'training.manage'))) {
    return c.json({ error: 'You can’t mark this training complete.' }, 403);
  }

  await database
    .insert(s.trainingCompletions)
    .values({ trainingId: id, userId: targetUserId, completedAt: Math.floor(Date.now() / 1000), markedBy: viewer.id })
    .onConflictDoNothing();

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'training.complete',
    targetType: 'user',
    targetId: String(targetUserId),
    meta: { trainingId: id },
  });
  return c.json({ ok: true });
});

/** Un-mark a completion. Same authorization as marking. */
training.delete('/:id/complete', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const viewer = c.get('viewer')!;
  const body = await c.req.json<{ userId?: number }>().catch(() => ({}) as { userId?: number });
  const targetUserId = Number.isInteger(body.userId) ? Number(body.userId) : viewer.id;

  const database = db(c.env);
  const course = await database.query.trainings.findFirst({ where: eq(s.trainings.id, id) });
  if (!course) return c.json({ error: 'No such course' }, 404);
  if (!mayMark(viewer.id, targetUserId, course.completionMode, can(viewer, 'training.manage'))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await database
    .delete(s.trainingCompletions)
    .where(and(eq(s.trainingCompletions.trainingId, id), eq(s.trainingCompletions.userId, targetUserId)));

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'training.uncomplete',
    targetType: 'user',
    targetId: String(targetUserId),
    meta: { trainingId: id },
  });
  return c.json({ ok: true });
});

/** A member's full training status (required for their rank + completion). Self, or training.view. */
training.get('/status/:userId', requireAuth, async (c) => {
  const userId = Number(c.req.param('userId'));
  const viewer = c.get('viewer')!;
  if (userId !== viewer.id && !can(viewer, 'training.view')) {
    return c.json({ error: 'Forbidden', missing: 'training.view' }, 403);
  }

  const database = db(c.env);
  const user = await database.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user) return c.json({ error: 'No such member' }, 404);

  const courses = await database.select().from(s.trainings).orderBy(asc(s.trainings.sortOrder), asc(s.trainings.id));
  const ids = courses.map((t) => t.id);
  const reqMap = await requiredRanksFor(database, ids);
  const done = ids.length
    ? await database
        .select({ trainingId: s.trainingCompletions.trainingId, completedAt: s.trainingCompletions.completedAt })
        .from(s.trainingCompletions)
        .where(and(eq(s.trainingCompletions.userId, userId), inArray(s.trainingCompletions.trainingId, ids)))
    : [];
  const doneMap = new Map(done.map((d) => [d.trainingId, d.completedAt]));
  const rankId = user.rankId ?? -1;

  return c.json({
    trainings: courses.map((t) => {
      const requiredRankIds = reqMap.get(t.id) ?? [];
      return {
        id: t.id,
        title: t.title,
        completionMode: t.completionMode,
        required: requiredRankIds.includes(rankId),
        completed: doneMap.has(t.id),
        completedAt: doneMap.get(t.id) ?? null,
      };
    }),
  });
});

export default training;
