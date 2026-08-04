/**
 * Recurring events — the "baton" model.
 *
 * An event with a non-'none' recurrence is the current occurrence of a series.
 * Once it has ended, the hourly cron spawns the next occurrence (same title,
 * roles, image, location and duration; a fresh sign-up sheet and its own
 * Discord scheduled event + message) and clears the finished row's recurrence
 * back to 'none'. The baton therefore moves forward: at most one future
 * occurrence per series ever carries a recurrence, so nothing double-spawns and
 * stopping the series is just setting the current occurrence back to 'none'.
 */

import { drizzle } from 'drizzle-orm/d1';
import { and, eq, lt, ne } from 'drizzle-orm';
import * as schema from '../../db/schema';
import * as s from '../../db/schema';
import type { Env } from '../env';
import { syncEventToDiscord } from '../discord/events';

type Recurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

/** Cap per run so a long-idle cron can't fan out into a huge Discord burst. */
const MAX_SPAWN_PER_RUN = 10;

/** Advance a unix-second moment by one recurrence interval. */
function addInterval(unixSec: number, rec: Recurrence): number {
  switch (rec) {
    case 'daily':
      return unixSec + 86_400;
    case 'weekly':
      return unixSec + 604_800;
    case 'biweekly':
      return unixSec + 1_209_600;
    case 'monthly': {
      // Calendar month, preserving the UTC time-of-day (setUTCMonth handles the
      // year rollover; a day that doesn't exist next month rolls forward, which
      // is fine for clan events).
      const d = new Date(unixSec * 1000);
      d.setUTCMonth(d.getUTCMonth() + 1);
      return Math.floor(d.getTime() / 1000);
    }
    default:
      return unixSec;
  }
}

/** The next occurrence strictly in the future, skipping any missed intervals. */
function nextFutureStart(startsAt: number, rec: Recurrence, nowSec: number): number {
  let next = addInterval(startsAt, rec);
  // Guard the loop (monthly ~ up to a few iterations; others bounded too).
  let guard = 0;
  while (next <= nowSec && guard < 1000) {
    next = addInterval(next, rec);
    guard += 1;
  }
  return next;
}

export interface RecurrenceResult {
  spawned: number;
}

/**
 * Find ended recurring events and roll each forward one occurrence. Run from
 * the hourly cron. DB-only when the bot isn't configured (the Discord sync
 * simply no-ops), so it's always safe to call.
 */
export async function materializeRecurringEvents(env: Env): Promise<RecurrenceResult> {
  const db = drizzle(env.DB, { schema });
  const nowSec = Math.floor(Date.now() / 1000);

  const due = await db
    .select()
    .from(s.events)
    .where(and(ne(s.events.recurrence, 'none'), lt(s.events.endsAt, nowSec), eq(s.events.status, 'scheduled')))
    .limit(MAX_SPAWN_PER_RUN);

  let spawned = 0;
  for (const src of due) {
    const rec = src.recurrence as Recurrence;
    const duration = src.endsAt - src.startsAt;
    const nextStart = nextFutureStart(src.startsAt, rec, nowSec);
    const nextEnd = nextStart + duration;

    // Clear the finished row's recurrence FIRST so a retry (or overlapping run)
    // can't spawn it twice; the new occurrence carries the baton.
    await db.update(s.events).set({ recurrence: 'none' }).where(eq(s.events.id, src.id));

    const created = (
      await db
        .insert(s.events)
        .values({
          title: src.title,
          description: src.description,
          imageUrl: src.imageUrl,
          startsAt: nextStart,
          endsAt: nextEnd,
          location: src.location,
          gameId: src.gameId,
          createdBy: src.createdBy,
          recurrence: rec,
          status: 'scheduled',
        })
        .returning()
    )[0]!;

    // Copy the sign-up roles (not the sign-ups — each occurrence starts empty).
    const roles = await db.select().from(s.eventRoles).where(eq(s.eventRoles.eventId, src.id));
    if (roles.length) {
      await db.insert(s.eventRoles).values(
        roles.map((r) => ({
          eventId: created.id,
          name: r.name,
          emoji: r.emoji,
          capacity: r.capacity,
          sortOrder: r.sortOrder,
        })),
      );
    }

    await db.insert(s.auditLog).values({
      action: 'event.recurrence_spawn',
      targetType: 'event',
      targetId: String(created.id),
      meta: { fromEventId: src.id, recurrence: rec, title: created.title },
      source: 'system',
    });

    // Mirror the new occurrence to Discord and persist the returned ids.
    try {
      const ids = await syncEventToDiscord(env, created.id);
      if (ids.discordEventId || ids.discordMessageId) {
        await db.update(s.events).set(ids).where(eq(s.events.id, created.id));
      }
    } catch (err) {
      console.error('Recurring event Discord sync failed', err);
    }

    spawned += 1;
  }

  return { spawned };
}
