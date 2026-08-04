/**
 * Events — clan happenings that mirror to Discord (a native scheduled event +
 * an announcement message that doubles as a sign-up sheet). Viewing needs
 * events.view; creating/editing/cancelling needs events.manage; seeing the full
 * attendee list needs events.attendees. Members with events.view can sign
 * themselves up (and pick a role). Times are unix seconds (UTC).
 */

import { Hono } from 'hono';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { syncEventToDiscord, removeEventFromDiscord, refreshEventMessage } from '../discord/events';
import { loadEventState, setSignup, removeSignup } from '../events/signups';

const events = new Hono<AppContext>();

interface RoleInput {
  id?: number;
  name: string;
  emoji?: string | null;
  capacity?: number | null;
}
type Recurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
const RECURRENCES: Recurrence[] = ['none', 'daily', 'weekly', 'biweekly', 'monthly'];

interface EventBody {
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  startsAt?: number;
  endsAt?: number;
  location?: string;
  gameId?: number | null;
  roles?: RoleInput[];
  recurrence?: Recurrence;
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
  if (b.imageUrl != null && b.imageUrl !== '' && !b.imageUrl.startsWith('/media/events/')) {
    return 'Invalid event image.';
  }
  if (b.recurrence !== undefined && !RECURRENCES.includes(b.recurrence)) {
    return 'Invalid recurrence.';
  }
  return null;
}

/**
 * Persist an event's roles. When `roles` is given it's the full desired set:
 * rows carrying an `id` are updated, new rows inserted, and any existing role
 * not present is deleted (freeing its holders to "attending, no role"). Called
 * on create (existing empty) and on edit (when roles are supplied).
 */
async function saveRoles(database: ReturnType<typeof db>, eventId: number, roles: RoleInput[]): Promise<void> {
  const clean = roles
    .map((r, idx) => ({
      id: r.id,
      name: (r.name ?? '').trim().slice(0, 40),
      emoji: r.emoji?.trim()?.slice(0, 8) || null,
      capacity: r.capacity != null && r.capacity > 0 ? Math.min(Math.floor(r.capacity), 999) : null,
      sortOrder: idx,
    }))
    .filter((r) => r.name)
    .slice(0, 20);

  const existing = await database
    .select({ id: s.eventRoles.id })
    .from(s.eventRoles)
    .where(eq(s.eventRoles.eventId, eventId));
  const existingIds = new Set(existing.map((e) => e.id));
  const keepIds = new Set(clean.filter((r) => r.id && existingIds.has(r.id)).map((r) => r.id!));

  const toDelete = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
  if (toDelete.length) {
    await database.delete(s.eventRoles).where(inArray(s.eventRoles.id, toDelete));
  }

  for (const r of clean) {
    if (r.id && existingIds.has(r.id)) {
      await database
        .update(s.eventRoles)
        .set({ name: r.name, emoji: r.emoji, capacity: r.capacity, sortOrder: r.sortOrder })
        .where(and(eq(s.eventRoles.id, r.id), eq(s.eventRoles.eventId, eventId)));
    } else {
      await database
        .insert(s.eventRoles)
        .values({ eventId, name: r.name, emoji: r.emoji, capacity: r.capacity, sortOrder: r.sortOrder });
    }
  }
}

/** Upcoming (and in-progress) events with their roles, counts, and the viewer's own sign-up. */
events.get('/', requirePermission('events.view'), async (c) => {
  const viewer = c.get('viewer')!;
  const nowSec = Math.floor(Date.now() / 1000);
  const database = db(c.env);

  const rows = await database
    .select({
      id: s.events.id,
      title: s.events.title,
      description: s.events.description,
      imageUrl: s.events.imageUrl,
      startsAt: s.events.startsAt,
      endsAt: s.events.endsAt,
      location: s.events.location,
      gameId: s.events.gameId,
      gameName: s.games.name,
      createdBy: s.events.createdBy,
      recurrence: s.events.recurrence,
    })
    .from(s.events)
    .leftJoin(s.games, eq(s.events.gameId, s.games.id))
    .where(and(eq(s.events.status, 'scheduled'), gte(s.events.endsAt, nowSec)))
    .orderBy(asc(s.events.startsAt));

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return c.json({ events: [] });

  // Three bounded queries regardless of how many events are listed.
  const [roleRows, countRows, mine] = await Promise.all([
    database
      .select()
      .from(s.eventRoles)
      .where(inArray(s.eventRoles.eventId, ids))
      .orderBy(asc(s.eventRoles.sortOrder), asc(s.eventRoles.id)),
    database
      .select({ eventId: s.eventSignups.eventId, roleId: s.eventSignups.eventRoleId, n: sql<number>`count(*)` })
      .from(s.eventSignups)
      .where(inArray(s.eventSignups.eventId, ids))
      .groupBy(s.eventSignups.eventId, s.eventSignups.eventRoleId),
    database
      .select({ eventId: s.eventSignups.eventId, roleId: s.eventSignups.eventRoleId })
      .from(s.eventSignups)
      .where(and(inArray(s.eventSignups.eventId, ids), eq(s.eventSignups.userId, viewer.id))),
  ]);

  const totalByEvent = new Map<number, number>();
  const roleCount = new Map<string, number>();
  for (const cr of countRows) {
    const n = Number(cr.n);
    totalByEvent.set(cr.eventId, (totalByEvent.get(cr.eventId) ?? 0) + n);
    if (cr.roleId != null) roleCount.set(`${cr.eventId}:${cr.roleId}`, n);
  }

  const rolesByEvent = new Map<number, unknown[]>();
  for (const r of roleRows) {
    const list = rolesByEvent.get(r.eventId) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      capacity: r.capacity,
      count: roleCount.get(`${r.eventId}:${r.id}`) ?? 0,
    });
    rolesByEvent.set(r.eventId, list);
  }

  const mineByEvent = new Map<number, number | null>();
  for (const m of mine) mineByEvent.set(m.eventId, m.roleId);

  const enriched = rows.map((r) => ({
    ...r,
    roles: rolesByEvent.get(r.id) ?? [],
    signupCount: totalByEvent.get(r.id) ?? 0,
    mySignup: mineByEvent.has(r.id) ? { roleId: mineByEvent.get(r.id) ?? null } : null,
  }));

  return c.json({ events: enriched });
});

/** The full sign-up roster for one event — who's coming, and as what. */
events.get('/:id/signups', requirePermission('events.attendees'), async (c) => {
  const id = Number(c.req.param('id'));
  const state = await loadEventState(db(c.env), id);
  if (!state) return c.json({ error: 'No such event' }, 404);
  return c.json({ signups: state.signups, roles: state.roles, total: state.total });
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
        imageUrl: body.imageUrl?.trim() || null,
        startsAt: body.startsAt!,
        endsAt: body.endsAt!,
        location: body.location!.trim().slice(0, 100),
        gameId: body.gameId ?? null,
        createdBy: viewer.id,
        recurrence: body.recurrence ?? 'none',
      })
      .returning()
  )[0]!;

  if (body.roles) await saveRoles(database, created.id, body.roles);

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'event.create',
    targetType: 'event',
    targetId: String(created.id),
    meta: { title: created.title },
  });

  // Mirror to Discord in the background, then store the returned ids.
  c.executionCtx.waitUntil(
    (async () => {
      const ids = await syncEventToDiscord(c.env, created.id);
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
  if (body.imageUrl !== undefined) patch.imageUrl = body.imageUrl?.trim() || null;
  if (body.location !== undefined) patch.location = body.location.trim().slice(0, 100);
  if (body.startsAt !== undefined) patch.startsAt = body.startsAt;
  if (body.endsAt !== undefined) patch.endsAt = body.endsAt;
  if (body.gameId !== undefined) patch.gameId = body.gameId ?? null;
  if (body.recurrence !== undefined) patch.recurrence = body.recurrence;

  const updated = (await database.update(s.events).set(patch).where(eq(s.events.id, id)).returning())[0]!;
  if (body.roles !== undefined) await saveRoles(database, id, body.roles);

  c.executionCtx.waitUntil(
    (async () => {
      const ids = await syncEventToDiscord(c.env, id);
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

/** Sign the viewer up (or move them to a different role). roleId null = no specific role. */
events.post('/:id/signup', requirePermission('events.view'), async (c) => {
  const id = Number(c.req.param('id'));
  const { roleId } = await c.req.json<{ roleId?: number | null }>();
  const viewer = c.get('viewer')!;

  const res = await setSignup(db(c.env), id, viewer.id, roleId ?? null);
  if (!res.ok) return c.json({ error: res.error }, 400);

  c.executionCtx.waitUntil(refreshEventMessage(c.env, id));
  return c.json({ ok: true });
});

/** Withdraw the viewer's own sign-up. */
events.delete('/:id/signup', requirePermission('events.view'), async (c) => {
  const id = Number(c.req.param('id'));
  const viewer = c.get('viewer')!;

  await removeSignup(db(c.env), id, viewer.id);
  c.executionCtx.waitUntil(refreshEventMessage(c.env, id));
  return c.json({ ok: true });
});

export default events;
