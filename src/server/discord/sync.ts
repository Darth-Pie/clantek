/**
 * Keeps website roles and Discord roles in agreement.
 *
 * The website is the source of truth. Granting a role here pushes to Discord;
 * reconcile() pulls Discord back into line for anything changed directly in
 * Discord's UI (which Workers cannot observe live — see interactions.ts).
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as s from '../../db/schema';
import { DiscordRest, DiscordError } from './rest';

type DB = DrizzleD1Database<typeof s>;

export interface SyncResult {
  discordSynced: boolean;
  warning?: string;
}

export async function grantRole(
  db: DB,
  rest: DiscordRest | null,
  opts: { userId: number; roleId: number; actorId: number; reason?: string },
): Promise<SyncResult> {
  const [user, role] = await Promise.all([
    db.query.users.findFirst({ where: eq(s.users.id, opts.userId) }),
    db.query.roles.findFirst({ where: eq(s.roles.id, opts.roleId) }),
  ]);
  if (!user) throw new Error(`No such member: ${opts.userId}`);
  if (!role) throw new Error(`No such role: ${opts.roleId}`);

  // A manual grant wins: if the role was previously held via rank, upgrade the
  // source so a later rank change can't strip it.
  await db
    .insert(s.userRoles)
    .values({ userId: user.id, roleId: role.id, grantedBy: opts.actorId, source: 'manual' })
    .onConflictDoUpdate({
      target: [s.userRoles.userId, s.userRoles.roleId],
      set: { source: 'manual', grantedBy: opts.actorId },
    });

  await db.insert(s.auditLog).values({
    actorId: opts.actorId,
    action: 'role.grant',
    targetType: 'user',
    targetId: String(user.id),
    meta: { roleId: role.id, roleName: role.name, reason: opts.reason },
  });

  return pushToDiscord(rest, 'add', user.discordId, role.discordRoleId, opts.reason);
}

export async function revokeRole(
  db: DB,
  rest: DiscordRest | null,
  opts: { userId: number; roleId: number; actorId: number; reason?: string },
): Promise<SyncResult> {
  const [user, role] = await Promise.all([
    db.query.users.findFirst({ where: eq(s.users.id, opts.userId) }),
    db.query.roles.findFirst({ where: eq(s.roles.id, opts.roleId) }),
  ]);
  if (!user) throw new Error(`No such member: ${opts.userId}`);
  if (!role) throw new Error(`No such role: ${opts.roleId}`);

  await db
    .delete(s.userRoles)
    .where(and(eq(s.userRoles.userId, user.id), eq(s.userRoles.roleId, role.id)));

  await db.insert(s.auditLog).values({
    actorId: opts.actorId,
    action: 'role.revoke',
    targetType: 'user',
    targetId: String(user.id),
    meta: { roleId: role.id, roleName: role.name, reason: opts.reason },
  });

  return pushToDiscord(rest, 'remove', user.discordId, role.discordRoleId, opts.reason);
}

/**
 * A Discord failure must not roll back the website grant — the site is
 * authoritative, and reconcile() will catch up later. Report it, don't throw.
 */
async function pushToDiscord(
  rest: DiscordRest | null,
  op: 'add' | 'remove',
  discordUserId: string,
  discordRoleId: string | null,
  reason?: string,
): Promise<SyncResult> {
  if (!rest || !discordRoleId) return { discordSynced: false };

  const auditReason = reason ?? 'ClanTek admin portal';
  try {
    if (op === 'add') await rest.addRole(discordUserId, discordRoleId, auditReason);
    else await rest.removeRole(discordUserId, discordRoleId, auditReason);
    return { discordSynced: true };
  } catch (err) {
    const warning =
      err instanceof DiscordError && err.status === 403
        ? 'Saved here, but Discord refused: the bot needs MANAGE_ROLES and its role must sit above this one in Server Settings → Roles.'
        : `Saved here, but the Discord update failed: ${(err as Error).message}`;
    return { discordSynced: false, warning };
  }
}

/**
 * Pushes every mapped role for one member so Discord matches the website.
 * Run after a manual change in Discord, or on a cron.
 */
export async function reconcileMember(
  db: DB,
  rest: DiscordRest,
  userId: number,
): Promise<{ added: string[]; removed: string[] }> {
  const user = await db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user) throw new Error(`No such member: ${userId}`);

  const mapped = await db.select().from(s.roles);
  const byDiscordId = new Map(
    mapped.filter((r) => r.discordRoleId).map((r) => [r.discordRoleId!, r]),
  );

  const held = await db
    .select({ discordRoleId: s.roles.discordRoleId })
    .from(s.userRoles)
    .innerJoin(s.roles, eq(s.userRoles.roleId, s.roles.id))
    .where(eq(s.userRoles.userId, user.id));

  const shouldHave = new Set(held.map((r) => r.discordRoleId).filter((id): id is string => !!id));
  const currentlyHas = await rest.getMemberRoles(user.discordId);
  if (currentlyHas === null) return { added: [], removed: [] }; // left the server

  const added: string[] = [];
  const removed: string[] = [];

  for (const roleId of shouldHave) {
    if (!currentlyHas.includes(roleId)) {
      await rest.addRole(user.discordId, roleId, 'ClanTek reconciliation');
      added.push(roleId);
    }
  }
  // Only touch roles ClanTek manages; leave unmapped Discord roles alone.
  for (const roleId of currentlyHas) {
    if (byDiscordId.has(roleId) && !shouldHave.has(roleId)) {
      await rest.removeRole(user.discordId, roleId, 'ClanTek reconciliation');
      removed.push(roleId);
    }
  }

  return { added, removed };
}

/* ------------------------------------------------------------------ *
 * Rank-driven roles
 *
 * A rank confers a set of roles. Assigning a member to a rank grants those
 * roles (marked source='rank'); changing rank reconciles them. Manual grants
 * (source='manual') are never touched here, so an admin's explicit grant
 * survives promotions and demotions.
 * ------------------------------------------------------------------ */

export interface RankRoleSyncResult {
  added: string[];
  removed: string[];
  warnings: string[];
}

/**
 * Make a member's rank-derived roles exactly match what `rankId` confers,
 * pushing each change to Discord. Roles the member holds manually are left as
 * they are — including ones the rank also happens to grant.
 */
export async function syncMemberRankRoles(
  db: DB,
  rest: DiscordRest | null,
  opts: { userId: number; rankId: number | null; actorId: number | null },
): Promise<RankRoleSyncResult> {
  const user = await db.query.users.findFirst({ where: eq(s.users.id, opts.userId) });
  if (!user) throw new Error(`No such member: ${opts.userId}`);

  const desired = opts.rankId
    ? (
        await db
          .select({ roleId: s.rankRoles.roleId })
          .from(s.rankRoles)
          .where(eq(s.rankRoles.rankId, opts.rankId))
      ).map((r) => r.roleId)
    : [];
  const desiredSet = new Set(desired);

  const current = await db
    .select({ roleId: s.userRoles.roleId, source: s.userRoles.source })
    .from(s.userRoles)
    .where(eq(s.userRoles.userId, opts.userId));
  const heldIds = new Set(current.map((c) => c.roleId));
  const rankHeldIds = current.filter((c) => c.source === 'rank').map((c) => c.roleId);

  // Add anything the rank grants that the member doesn't already hold (in any
  // form); drop rank-held roles the new rank no longer grants.
  const toAdd = desired.filter((id) => !heldIds.has(id));
  const toRemove = rankHeldIds.filter((id) => !desiredSet.has(id));

  const result: RankRoleSyncResult = { added: [], removed: [], warnings: [] };
  if (!toAdd.length && !toRemove.length) return result;

  const involved = [...new Set([...toAdd, ...toRemove])];
  const roleRows = involved.length
    ? await db.select().from(s.roles).where(inArray(s.roles.id, involved))
    : [];
  const roleById = new Map(roleRows.map((r) => [r.id, r]));

  for (const roleId of toAdd) {
    const role = roleById.get(roleId);
    if (!role) continue;
    await db
      .insert(s.userRoles)
      .values({ userId: opts.userId, roleId, source: 'rank', grantedBy: opts.actorId })
      .onConflictDoNothing();
    result.added.push(role.name);
    const push = await pushToDiscord(rest, 'add', user.discordId, role.discordRoleId, 'ClanTek rank role');
    if (push.warning) result.warnings.push(push.warning);
  }

  for (const roleId of toRemove) {
    const role = roleById.get(roleId);
    if (!role) continue;
    await db
      .delete(s.userRoles)
      .where(and(eq(s.userRoles.userId, opts.userId), eq(s.userRoles.roleId, roleId)));
    result.removed.push(role.name);
    const push = await pushToDiscord(rest, 'remove', user.discordId, role.discordRoleId, 'ClanTek rank role');
    if (push.warning) result.warnings.push(push.warning);
  }

  await db.insert(s.auditLog).values({
    actorId: opts.actorId,
    action: 'rank.roles_sync',
    targetType: 'user',
    targetId: String(opts.userId),
    meta: { rankId: opts.rankId, added: result.added, removed: result.removed },
  });

  return result;
}

/** Re-apply a rank's role set to everyone currently holding that rank. */
export async function syncRankHolders(
  db: DB,
  rest: DiscordRest | null,
  rankId: number,
): Promise<{ members: number; warnings: string[] }> {
  const holders = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(eq(s.users.rankId, rankId));

  const warnings = new Set<string>();
  for (const h of holders) {
    const r = await syncMemberRankRoles(db, rest, { userId: h.id, rankId, actorId: null });
    r.warnings.forEach((w) => warnings.add(w));
  }
  return { members: holders.length, warnings: [...warnings] };
}
