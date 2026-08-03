/**
 * Slash command handlers.
 *
 * Every command resolves the invoking Discord user to a ClanTek member and
 * runs the same permission checks the web portal uses. There is no separate
 * "Discord admin" concept — one identity, one permission model, both surfaces.
 */

import { asc, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';
import * as s from '../../db/schema';
import { can, outranks, type Viewer, type Permission } from '../../shared/permissions';
import type { Env } from '../env';
import { DiscordRest } from './rest';
import { syncMemberRankRoles } from './sync';
import { ephemeral, invoker, optionValue, reply, type Interaction } from './interactions';

type DB = ReturnType<typeof drizzle<typeof schema>>;

/** Same Viewer shape the web app uses, resolved from a Discord snowflake. */
async function viewerFromDiscordId(db: DB, discordId: string): Promise<Viewer | null> {
  const user = await db.query.users.findFirst({ where: eq(s.users.discordId, discordId) });
  if (!user || user.status === 'banned') return null;

  const rank = user.rankId
    ? ((await db.query.ranks.findFirst({ where: eq(s.ranks.id, user.rankId) })) ?? null)
    : null;

  const grants = await db
    .select({ roleId: s.roles.id, name: s.roles.name, permission: s.rolePermissions.permission })
    .from(s.userRoles)
    .innerJoin(s.roles, eq(s.userRoles.roleId, s.roles.id))
    .leftJoin(s.rolePermissions, eq(s.rolePermissions.roleId, s.roles.id))
    .where(eq(s.userRoles.userId, user.id));

  const roles = new Map<number, { id: number; name: string; color: null }>();
  const permissions = new Set<Permission>();
  for (const g of grants) {
    roles.set(g.roleId, { id: g.roleId, name: g.name, color: null });
    if (g.permission) permissions.add(g.permission as Permission);
  }

  return {
    id: user.id,
    discordId: user.discordId,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
    isGod: user.isGod,
    rank: rank ? { id: rank.id, name: rank.name, sortOrder: rank.sortOrder } : null,
    roles: [...roles.values()],
    permissions: [...permissions],
  };
}

export async function handleCommand(env: Env, i: Interaction) {
  const db = drizzle(env.DB, { schema });
  const caller = invoker(i);
  if (!caller) return ephemeral('Could not identify you.');

  const viewer = await viewerFromDiscordId(db, caller.id);
  if (!viewer) {
    return ephemeral('You do not have a ClanTek account yet — sign in on the website once first.');
  }

  switch (i.data?.name) {
    case 'whois':
      return whois(db, i);
    case 'roster':
      return roster(db);
    case 'promote':
      return promote(env, db, viewer, i);
    default:
      return ephemeral(`Unknown command: ${i.data?.name}`);
  }
}

async function whois(db: DB, i: Interaction) {
  const targetId = optionValue<string>(i, 'member');
  if (!targetId) return ephemeral('Specify a member.');

  const user = await db.query.users.findFirst({ where: eq(s.users.discordId, targetId) });
  if (!user) return ephemeral('That person has no ClanTek account.');

  const rank = user.rankId
    ? await db.query.ranks.findFirst({ where: eq(s.ranks.id, user.rankId) })
    : null;

  const roles = await db
    .select({ name: s.roles.name })
    .from(s.userRoles)
    .innerJoin(s.roles, eq(s.userRoles.roleId, s.roles.id))
    .where(eq(s.userRoles.userId, user.id));

  const medalCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(s.memberMedals)
    .where(eq(s.memberMedals.userId, user.id));

  return reply(
    [
      `**${user.globalName ?? user.username}**`,
      `Rank: ${rank?.name ?? '—'}`,
      `Roles: ${roles.length ? roles.map((r) => r.name).join(', ') : '—'}`,
      `Medals: ${medalCount[0]?.n ?? 0}`,
      `Status: ${user.status}`,
      `Joined: <t:${user.joinedAt}:D>`,
    ].join('\n'),
  );
}

async function roster(db: DB) {
  const rows = await db
    .select({ rank: s.ranks.name, order: s.ranks.sortOrder, n: sql<number>`count(${s.users.id})` })
    .from(s.ranks)
    .leftJoin(s.users, eq(s.users.rankId, s.ranks.id))
    .groupBy(s.ranks.id)
    .orderBy(desc(s.ranks.sortOrder));

  const total = rows.reduce((sum, r) => sum + Number(r.n), 0);
  const lines = rows.map((r) => `${r.rank}: ${r.n}`);
  return reply(`**Roster — ${total} members**\n${lines.join('\n')}`);
}

async function promote(env: Env, db: DB, viewer: Viewer, i: Interaction) {
  if (!can(viewer, 'roster.promote')) {
    return ephemeral('You do not have permission to promote members.');
  }

  const targetId = optionValue<string>(i, 'member');
  if (!targetId) return ephemeral('Specify a member.');

  const target = await db.query.users.findFirst({ where: eq(s.users.discordId, targetId) });
  if (!target) return ephemeral('That person has no ClanTek account.');

  const currentRank = target.rankId
    ? await db.query.ranks.findFirst({ where: eq(s.ranks.id, target.rankId) })
    : null;

  // You cannot promote someone to or past your own standing.
  if (!outranks(viewer, currentRank?.sortOrder ?? null)) {
    return ephemeral('You can only promote members who rank below you.');
  }

  const nextRank = await db.query.ranks.findFirst({
    where: sql`${s.ranks.sortOrder} > ${currentRank?.sortOrder ?? -1}`,
    orderBy: asc(s.ranks.sortOrder),
  });
  if (!nextRank) return ephemeral(`${target.username} is already at the highest rank.`);

  if (!outranks(viewer, nextRank.sortOrder)) {
    return ephemeral('That promotion would place them at or above your own rank.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  await db
    .update(s.users)
    .set({ rankId: nextRank.id, promotedAt: nowSec, updatedAt: nowSec })
    .where(eq(s.users.id, target.id));

  await db.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'member.promote',
    targetType: 'user',
    targetId: String(target.id),
    meta: { from: currentRank?.name ?? null, to: nextRank.name },
    source: 'discord',
  });

  // Apply the new rank's roles and reflect them into Discord.
  const client =
    env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID
      ? new DiscordRest(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID)
      : null;
  const rankRoleSync = await syncMemberRankRoles(db, client, {
    userId: target.id,
    rankId: nextRank.id,
    actorId: viewer.id,
  });

  const roleNote = rankRoleSync.added.length
    ? `\nRoles added: ${rankRoleSync.added.join(', ')}`
    : '';

  return reply(
    `**${target.globalName ?? target.username}** promoted to **${nextRank.name}**` +
      (currentRank ? ` (from ${currentRank.name})` : '') +
      roleNote,
  );
}
