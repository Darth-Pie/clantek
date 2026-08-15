/**
 * Activity medals: handed out automatically once a member has attended enough
 * events. A medal opts in by setting `autoGrantAttendance` (10, 50, 100, …).
 *
 * Pure database work, mirroring the tenure sweep (server/medals/tenure.ts): cheap
 * to run for the whole roster on the cron and for a single member right after a
 * check-in. Idempotent — a medal already held is skipped.
 */

import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as s from '../../db/schema';

type DB = DrizzleD1Database<typeof s>;

export interface ActivityResult {
  awarded: { userId: number; medalName: string }[];
}

/**
 * Grant every activity medal a member has earned but doesn't yet hold. Pass a
 * userId to evaluate one member (after a check-in); omit it to sweep all
 * non-banned members (cron).
 */
export async function awardActivityMedals(db: DB, opts: { userId?: number } = {}): Promise<ActivityResult> {
  const activityMedals = await db
    .select({ id: s.medals.id, name: s.medals.name, threshold: s.medals.autoGrantAttendance })
    .from(s.medals)
    .where(isNotNull(s.medals.autoGrantAttendance));
  if (!activityMedals.length) return { awarded: [] };
  const medalIds = activityMedals.map((m) => m.id);

  // Attended-event counts per member (one member, or the whole non-banned roster).
  const countRows = await db
    .select({ userId: s.eventAttendance.userId, n: sql<number>`count(*)` })
    .from(s.eventAttendance)
    .innerJoin(s.users, eq(s.users.id, s.eventAttendance.userId))
    .where(opts.userId ? eq(s.eventAttendance.userId, opts.userId) : ne(s.users.status, 'banned'))
    .groupBy(s.eventAttendance.userId);
  if (!countRows.length) return { awarded: [] };

  const counts = new Map(countRows.map((r) => [r.userId, Number(r.n)]));
  const memberIds = [...counts.keys()];

  const existing = await db
    .select({ userId: s.memberMedals.userId, medalId: s.memberMedals.medalId })
    .from(s.memberMedals)
    .where(and(inArray(s.memberMedals.medalId, medalIds), inArray(s.memberMedals.userId, memberIds)));
  const held = new Set(existing.map((e) => `${e.userId}:${e.medalId}`));

  const awarded: ActivityResult['awarded'] = [];
  for (const [userId, count] of counts) {
    for (const medal of activityMedals) {
      if (count < medal.threshold!) continue;
      if (held.has(`${userId}:${medal.id}`)) continue;

      await db.insert(s.memberMedals).values({
        userId,
        medalId: medal.id,
        citation: `${medal.threshold} events attended`,
        awardedBy: null,
      });
      await db.insert(s.auditLog).values({
        action: 'medal.auto_award',
        targetType: 'user',
        targetId: String(userId),
        meta: { medalId: medal.id, medalName: medal.name, attendance: medal.threshold },
        source: 'system',
      });
      awarded.push({ userId, medalName: medal.name });
    }
  }
  return { awarded };
}
