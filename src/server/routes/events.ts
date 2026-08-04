/**
 * Events — clan happenings that mirror to Discord (a native scheduled event +
 * an announcement message). Viewing needs events.view; creating/editing/
 * cancelling needs events.manage. Times are unix seconds (UTC).
 */

import { Hono } from 'hono';
import { and, asc, eq, gte } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext, Env } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { syncEventToDiscord, removeEventFromDiscord } from '../discord/events';

const events = new Hono<AppContext>();

interface EventBody {
  title?: string;
  description?: string | null;
  startsAt?: number;
  endsAt?: number;
  location?: string;
  gameId?: number | null;
}

/** Validate the time/text fields shared by create and edit. Returns an error string or null. */
function validate(b: EventBody, requireAll: boolean): string | null {
  if (requireAll || b.title !== undefined) {
    if (!b.title?.trim()) return 'A title is required.';
  }
  if (requireAll || b.location !== undefined) {
    if (!b.location?.trim()) return 'A location is required.';
  }
  const bothTimes = b.startsAt !== undefined && b.endsAt !== undefined;
  if (requireAll || bothTimes) {
    if (!Number.isFinite(b.startsAt) || !Number.isFinite(b.endsAt)) return 'Start and end times are required.';
    if ((b.endsAt as number) <= (b.startsAt as number)) return 'The end time must be after the start time.';
  } else if (b.startsAt !== undefined || b.endsAt !== undefined) {
    return 'Change the start and end times together.';
  }
  return null;
}

async function gameNameFor(env: Env, gameId: number | null): Promise<string | null> {
  if (!gameId) return null;
  const g = await db(env).query.games.findFirst({ where: eq(s.games.id, gameId) });
  return g?.name ?? null;
}

/** Upcoming (and in-progress) events, soonest first. */
events.get('/', requirePermission('events.view'), async (c) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const rows = await db(c.env)
    .select({
      id: s.events.id,
      title: s.events.title,
      description: s.events.description,
      startsAt: s.events.startsAt,
      endsAt: s.events.endsAt,
      location: s.events.location,
      gameId: s.events.gameId,
      gameName: s.games.name,
      createdBy: s.events.createdBy,
    })
    .from(s.events)
    .leftJoin(s.games, eq(s.events.gameId, s.games.id))
    .where(and(eq(s.events.status, 'scheduled'), gte(s.events.endsAt, nowSec)))
    .orderBy(asc(s.events.startsAt));

  return c.json({ events: rows });
});

events.post('/', requirePermission('events.manage'), async (c) => {
  const body = await c.req.json<EventBody>();
  const err = validate(body, true);
  if (err) return c.json({ error: err }, 400);

  const database = db(c.env);
  const viewer = c.get('viewer')!;
  const created = (
    await database
      .insert(s.events)
      .values({
        title: body.title!.trim().slice(0, 120),
        description: body.description?.trim().slice(0, 1500) || null,
        startsAt: body.startsAt!,
        endsAt: body.endsAt!,
        location: body.location!.trim().slice(0, 100),
        gameId: body.gameId ?? null,
        createdBy: viewer.id,
      })
      .returning()
  )[0]!;

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'event.create',
    targetType: 'event',
    targetId: String(created.id),
    meta: { title: created.title },
  });

  // Mirror to Discord in the background, then store the returned ids.
  const gameName = await gameNameFor(c.env, created.gameId);
  c.executionCtx.waitUntil(
    (async () => {
      const ids = await syncEventToDiscord(c.env, created, gameName);
      if (ids.discordEventId !== created.discordEventId || ids.discordMessageId !== created.discordMessageId) {
        await database.update(s.events).set(ids).where(eq(s.events.id, created.id));
      }
    })(),
  );

  return c.json({ event: created }, 201);
});

events.patch('/:id', requirePermission('events.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<EventBody>();
  const err = validate(body, false);
  if (err) return c.json({ error: err }, 400);

  const database = db(c.env);
  const existing = await database.query.events.findFirst({ where: eq(s.events.id, id) });
  if (!existing) return c.json({ error: 'No such event' }, 404);

  const patch: Partial<typeof s.events.$inferInsert> = { updatedAt: Math.floor(Date.now() / 1000) };
  if (body.title !== undefined) patch.title = body.title.trim().slice(0, 120);
  if (body.description !== undefined) patch.description = body.description?.trim().slice(0, 1500) || null;
  if (body.location !== undefined) patch.location = body.location.trim().slice(0, 100);
  if (body.startsAt !== undefined) patch.startsAt = body.startsAt;
  if (body.endsAt !== undefined) patch.endsAt = body.endsAt;
  if (body.gameId !== undefined) patch.gameId = body.gameId ?? null;

  const updated = (await database.update(s.events).set(patch).where(eq(s.events.id, id)).returning())[0]!;

  const gameName = await gameNameFor(c.env, updated.gameId);
  c.executionCtx.waitUntil(
    (async () => {
      const ids = await syncEventToDiscord(c.env, updated, gameName);
      if (ids.discordEventId !== updated.discordEventId || ids.discordMessageId !== updated.discordMessageId) {
        await database.update(s.events).set(ids).where(eq(s.events.id, id));
      }
    })(),
  );

  return c.json({ event: updated });
});

events.delete('/:id', requirePermission('events.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const database = db(c.env);
  const event = await database.query.events.findFirst({ where: eq(s.events.id, id) });
  if (!event) return c.json({ error: 'No such event' }, 404);

  await database.delete(s.events).where(eq(s.events.id, id));
  c.executionCtx.waitUntil(removeEventFromDiscord(c.env, event));

  await database.insert(s.auditLog).values({
    actorId: c.get('viewer')!.id,
    action: 'event.delete',
    targetType: 'event',
    targetId: String(id),
    meta: { title: event.title },
  });

  return c.json({ ok: true });
});

export default events;
