/**
 * Event sign-ups — the shared source of truth used by BOTH the website routes
 * and the Discord button handler, so a sign-up made in either place is the same
 * row and the two surfaces stay in agreement.
 *
 * One row per member per event (unique index). Picking a different role updates
 * the row; withdrawing deletes it. eventRoleId NULL = "attending, no role".
 */

import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as s from '../../db/schema';
import { memberName } from '../../shared/names';
import { memberAvatar } from '../../shared/avatar';

type DB = DrizzleD1Database<typeof s>;

export interface RoleState {
  id: number;
  name: string;
  emoji: string | null;
  capacity: number | null;
  sortOrder: number;
  count: number;
}
export interface SignupEntry {
  userId: number;
  name: string;
  avatarUrl: string;
  roleId: number | null;
  roleName: string | null;
}
export interface EventState {
  event: typeof s.events.$inferSelect;
  gameName: string | null;
  roles: RoleState[];
  signups: SignupEntry[];
  total: number;
}

export interface SignupResult {
  ok: boolean;
  error?: string;
}

/**
 * Everything the website and Discord both need to render an event: the row, its
 * game name, its roles with live counts, and the full sign-up list (names +
 * avatars). One place so counts never disagree between surfaces.
 */
export async function loadEventState(db: DB, eventId: number): Promise<EventState | null> {
  const event = await db.query.events.findFirst({ where: eq(s.events.id, eventId) });
  if (!event) return null;

  const gameName = event.gameId
    ? ((await db.query.games.findFirst({ where: eq(s.games.id, event.gameId) }))?.name ?? null)
    : null;

  const roles = await db
    .select()
    .from(s.eventRoles)
    .where(eq(s.eventRoles.eventId, eventId))
    .orderBy(asc(s.eventRoles.sortOrder), asc(s.eventRoles.id));

  const signupRows = await db
    .select({
      userId: s.eventSignups.userId,
      roleId: s.eventSignups.eventRoleId,
      username: s.users.username,
      globalName: s.users.globalName,
      displayName: s.users.displayName,
      discordId: s.users.discordId,
      avatar: s.users.avatar,
      profileImageUrl: s.users.profileImageUrl,
    })
    .from(s.eventSignups)
    .innerJoin(s.users, eq(s.eventSignups.userId, s.users.id))
    .where(eq(s.eventSignups.eventId, eventId))
    .orderBy(asc(s.eventSignups.createdAt));

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const signups: SignupEntry[] = signupRows.map((r) => ({
    userId: r.userId,
    name: memberName({ displayName: r.displayName, globalName: r.globalName, username: r.username }),
    avatarUrl: memberAvatar({ discordId: r.discordId, avatar: r.avatar, profileImageUrl: r.profileImageUrl }, 64),
    roleId: r.roleId,
    roleName: r.roleId != null ? (roleNameById.get(r.roleId) ?? null) : null,
  }));

  const counts = new Map<number, number>();
  for (const su of signups) {
    if (su.roleId != null) counts.set(su.roleId, (counts.get(su.roleId) ?? 0) + 1);
  }
  const roleStates: RoleState[] = roles.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    capacity: r.capacity,
    sortOrder: r.sortOrder,
    count: counts.get(r.id) ?? 0,
  }));

  return { event, gameName, roles: roleStates, signups, total: signups.length };
}

/**
 * Sign a member up (or move them to a different role). roleId null = attending
 * with no specific role. Enforces the event being open and the role's capacity.
 * Idempotent via the unique (event,user) index.
 */
export async function setSignup(
  db: DB,
  eventId: number,
  userId: number,
  roleId: number | null,
): Promise<SignupResult> {
  const event = await db.query.events.findFirst({ where: eq(s.events.id, eventId) });
  if (!event) return { ok: false, error: 'No such event.' };
  if (event.status !== 'scheduled') return { ok: false, error: 'This event is not open for sign-ups.' };

  if (roleId != null) {
    const role = await db.query.eventRoles.findFirst({
      where: and(eq(s.eventRoles.id, roleId), eq(s.eventRoles.eventId, eventId)),
    });
    if (!role) return { ok: false, error: 'That role is not part of this event.' };
    if (role.capacity != null) {
      // Count current holders other than this member — moving within your own
      // seat mustn't count against the cap.
      const held = await db
        .select({ n: sql<number>`count(*)` })
        .from(s.eventSignups)
        .where(
          and(
            eq(s.eventSignups.eventId, eventId),
            eq(s.eventSignups.eventRoleId, roleId),
            ne(s.eventSignups.userId, userId),
          ),
        );
      if (Number(held[0]?.n ?? 0) >= role.capacity) {
        return { ok: false, error: `“${role.name}” is full.` };
      }
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  await db
    .insert(s.eventSignups)
    .values({ eventId, userId, eventRoleId: roleId, createdAt: nowSec, updatedAt: nowSec })
    .onConflictDoUpdate({
      target: [s.eventSignups.eventId, s.eventSignups.userId],
      set: { eventRoleId: roleId, updatedAt: nowSec },
    });

  return { ok: true };
}

/** Withdraw a member's sign-up. No-op if they weren't signed up. */
export async function removeSignup(db: DB, eventId: number, userId: number): Promise<void> {
  await db
    .delete(s.eventSignups)
    .where(and(eq(s.eventSignups.eventId, eventId), eq(s.eventSignups.userId, userId)));
}
