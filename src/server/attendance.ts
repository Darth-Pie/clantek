/**
 * Attendance & participation — the server service.
 *
 * Owns the config loader, the daily activity recorder (feeds the heatmap), the
 * check-in write (which also records an 'event' activity dot on the event's
 * day), and the read queries behind the participation score, the leaderboard,
 * and the heatmap. Kept as plain DB work so it's cheap to call from routes, the
 * session boot, and the cron.
 */

import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, gte, ne, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import * as s from '../db/schema';
import type { Env } from './env';
import { memberName } from '../shared/names';
import {
  DEFAULT_ATTENDANCE,
  sanitizeAttendanceConfig,
  unixDay,
  type AttendanceConfig,
} from '../shared/attendance';

export const ATTENDANCE_KEY = 'attendance';

type DB = ReturnType<typeof drizzle<typeof schema>>;

export async function loadAttendanceConfig(env: Env, database?: DB): Promise<AttendanceConfig> {
  const dbi = database ?? drizzle(env.DB, { schema });
  try {
    const row = await dbi.query.settings.findFirst({ where: eq(s.settings.key, ATTENDANCE_KEY) });
    if (row?.value && typeof row.value === 'object') return sanitizeAttendanceConfig(row.value);
  } catch {
    /* no settings row yet → defaults */
  }
  return DEFAULT_ATTENDANCE;
}

/**
 * Add `count` to a member's activity for a given day (default: today). Upserts
 * the (user, day, source) row. Best-effort — callers wrap it so a failed write
 * never breaks the request that triggered it.
 */
export async function recordActivity(
  database: DB,
  userId: number,
  source: 'web' | 'event' | 'discord',
  opts: { day?: number; count?: number } = {},
): Promise<void> {
  const day = opts.day ?? unixDay(Math.floor(Date.now() / 1000));
  const count = opts.count ?? 1;
  await database
    .insert(s.memberActivity)
    .values({ userId, day, source, count })
    .onConflictDoUpdate({
      target: [s.memberActivity.userId, s.memberActivity.day, s.memberActivity.source],
      set: { count: sql`${s.memberActivity.count} + ${count}` },
    });
}

export interface CheckInResult {
  ok: boolean;
  created: boolean;
}

/**
 * Record that a member attended an event. Idempotent (unique event+user), so a
 * second check-in is a no-op. On a fresh check-in it also drops an 'event'
 * activity dot on the event's own day, so the heatmap reflects when the event
 * actually happened rather than when the button was pressed.
 */
export async function checkIn(
  database: DB,
  args: { eventId: number; userId: number; source: 'self' | 'officer' | 'discord'; markedBy?: number | null; eventStartsAt: number },
): Promise<CheckInResult> {
  const before = await database
    .select({ id: s.eventAttendance.id })
    .from(s.eventAttendance)
    .where(and(eq(s.eventAttendance.eventId, args.eventId), eq(s.eventAttendance.userId, args.userId)));
  if (before.length > 0) return { ok: true, created: false };

  await database.insert(s.eventAttendance).values({
    eventId: args.eventId,
    userId: args.userId,
    source: args.source,
    markedBy: args.markedBy ?? null,
  });
  await recordActivity(database, args.userId, 'event', { day: unixDay(args.eventStartsAt) });
  return { ok: true, created: true };
}

/** Remove a member's attendance for an event (officer un-mark). */
export async function removeAttendance(database: DB, eventId: number, userId: number): Promise<void> {
  await database
    .delete(s.eventAttendance)
    .where(and(eq(s.eventAttendance.eventId, eventId), eq(s.eventAttendance.userId, userId)));
}

/** A member's participation score: events attended all-time, and within the recent window. */
export async function memberScore(
  database: DB,
  userId: number,
  recentWindowDays: number,
): Promise<{ all: number; recent: number }> {
  const cutoff = Math.floor(Date.now() / 1000) - recentWindowDays * 86400;
  const [row] = await database
    .select({
      all: sql<number>`count(*)`,
      recent: sql<number>`sum(case when ${s.events.startsAt} >= ${cutoff} then 1 else 0 end)`,
    })
    .from(s.eventAttendance)
    .innerJoin(s.events, eq(s.events.id, s.eventAttendance.eventId))
    .where(eq(s.eventAttendance.userId, userId));
  return { all: Number(row?.all ?? 0), recent: Number(row?.recent ?? 0) };
}

export interface LeaderRow {
  id: number;
  name: string;
  avatar: string | null;
  discordId: string;
  profileImageUrl: string | null;
  count: number;
}

/**
 * Top members by events attended. `windowDays` limits to events that started
 * within that many days (the "recent" board); omit for the all-time board.
 * Banned members are excluded.
 */
export async function leaderboard(
  database: DB,
  opts: { windowDays?: number; limit?: number } = {},
): Promise<LeaderRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const filters = [ne(s.users.status, 'banned')];
  if (opts.windowDays) {
    filters.push(gte(s.events.startsAt, Math.floor(Date.now() / 1000) - opts.windowDays * 86400));
  }
  const rows = await database
    .select({
      id: s.users.id,
      username: s.users.username,
      globalName: s.users.globalName,
      displayName: s.users.displayName,
      avatar: s.users.avatar,
      profileImageUrl: s.users.profileImageUrl,
      discordId: s.users.discordId,
      n: sql<number>`count(${s.eventAttendance.id})`,
    })
    .from(s.eventAttendance)
    .innerJoin(s.events, eq(s.events.id, s.eventAttendance.eventId))
    .innerJoin(s.users, eq(s.users.id, s.eventAttendance.userId))
    .where(and(...filters))
    .groupBy(s.users.id)
    .orderBy(desc(sql`count(${s.eventAttendance.id})`))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: memberName({ displayName: r.displayName, globalName: r.globalName, username: r.username }),
    avatar: r.avatar,
    profileImageUrl: r.profileImageUrl,
    discordId: r.discordId,
    count: Number(r.n),
  }));
}

/** Per-day activity totals for a member over the last `days` days (for the heatmap). */
export async function heatmap(
  database: DB,
  userId: number,
  days: number,
): Promise<{ day: number; count: number }[]> {
  const sinceDay = unixDay(Math.floor(Date.now() / 1000)) - days;
  const rows = await database
    .select({ day: s.memberActivity.day, count: sql<number>`sum(${s.memberActivity.count})` })
    .from(s.memberActivity)
    .where(and(eq(s.memberActivity.userId, userId), gte(s.memberActivity.day, sinceDay)))
    .groupBy(s.memberActivity.day);
  return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
}
