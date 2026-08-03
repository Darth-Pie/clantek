/**
 * Tenure medals: handed out automatically once a member has been in the guild
 * long enough. A medal opts in by setting `autoGrantMonths` (6, 12, 24, …).
 *
 * This is pure database work — no Discord calls — so it's cheap to run for the
 * whole roster on the cron and for a single member at login. Basis for "time in
 * guild" is the Discord guild-join date when known (users.guildJoinedAt),
 * falling back to the site-join date so members always accrue *something*.
 */

import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as s from '../../db/schema';

type DB = DrizzleD1Database<typeof s>;

// Average month. Tenure thresholds are coarse (6/12/24 months), so a day of
// drift at the boundary doesn't matter — the next sweep catches it regardless.
const SECONDS_PER_MONTH = 2_629_746;

/** Whole months between `sinceSec` (unix seconds) and now. */
function monthsSince(sinceSec: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor(Math.max(0, now - sinceSec) / SECONDS_PER_MONTH);
}

/** "6 months", "1 year", "2 years" — for the auto-award citation. */
function tenureLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} year${years === 1 ? '' : 's'}`;
  }
  return `${months} months`;
}

export interface TenureResult {
  awarded: { userId: number; medalName: string }[];
}

/**
 * Grant every tenure medal a member has earned but doesn't yet hold. Pass a
 * userId to evaluate one member (login); omit it to sweep all non-banned
 * members (cron). Idempotent: a medal already held is skipped.
 */
export async function awardTenureMedals(
  db: DB,
  opts: { userId?: number } = {},
): Promise<TenureResult> {
  const tenureMedals = await db
    .select({ id: s.medals.id, name: s.medals.name, months: s.medals.autoGrantMonths })
    .from(s.medals)
    .where(isNotNull(s.medals.autoGrantMonths));
  if (!tenureMedals.length) return { awarded: [] };

  const tenureMedalIds = tenureMedals.map((m) => m.id);

  const members = await db
    .select({
      id: s.users.id,
      guildJoinedAt: s.users.guildJoinedAt,
      joinedAt: s.users.joinedAt,
    })
    .from(s.users)
    .where(opts.userId ? eq(s.users.id, opts.userId) : ne(s.users.status, 'banned'));
  if (!members.length) return { awarded: [] };

  // Which tenure medals each of these members already holds.
  const memberIds = members.map((m) => m.id);
  const existing = await db
    .select({ userId: s.memberMedals.userId, medalId: s.memberMedals.medalId })
    .from(s.memberMedals)
    .where(
      and(inArray(s.memberMedals.medalId, tenureMedalIds), inArray(s.memberMedals.userId, memberIds)),
    );
  const held = new Set(existing.map((e) => `${e.userId}:${e.medalId}`));

  const awarded: TenureResult['awarded'] = [];

  for (const member of members) {
    const months = monthsSince(member.guildJoinedAt ?? member.joinedAt);
    for (const medal of tenureMedals) {
      if (months < medal.months!) continue;
      if (held.has(`${member.id}:${medal.id}`)) continue;

      await db.insert(s.memberMedals).values({
        userId: member.id,
        medalId: medal.id,
        citation: `${tenureLabel(medal.months!)} of service`,
        awardedBy: null,
      });
      await db.insert(s.auditLog).values({
        action: 'medal.auto_award',
        targetType: 'user',
        targetId: String(member.id),
        meta: { medalId: medal.id, medalName: medal.name, months: medal.months },
        source: 'system',
      });
      awarded.push({ userId: member.id, medalName: medal.name });
    }
  }

  return { awarded };
}
