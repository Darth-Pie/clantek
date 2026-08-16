/**
 * Slash command handlers.
 *
 * Every command resolves the invoking Discord user to a mustr member and
 * runs the same permission checks the web portal uses. There is no separate
 * "Discord admin" concept — one identity, one permission model, both surfaces.
 */

import { asc, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';
import * as s from '../../db/schema';
import { can, outranks, type Viewer, type Permission } from '../../shared/permissions';
import type { Env } from '../env';
import { discordClient } from '../config';
import { syncMemberRankRoles } from './sync';
import { announce } from './announce';
import { memberName } from '../../shared/names';
import { discordAvatar } from '../../shared/avatar';
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
    displayName: user.displayName,
    avatar: user.avatar,
    profileImageUrl: user.profileImageUrl,
    isGod: user.isGod,
    rank: rank ? { id: rank.id, name: rank.name, sortOrder: rank.sortOrder } : null,
    roles: [...roles.values()],
    permissions: [...permissions],
  };
}

export async function handleCommand(env: Env, i: Interaction, baseUrl?: string) {
  const db = drizzle(env.DB, { schema });
  const caller = invoker(i);
  if (!caller) return ephemeral('Could not identify you.');

  const viewer = await viewerFromDiscordId(db, caller.id);
  if (!viewer) {
    return ephemeral('You do not have a mustr account yet — sign in on the website once first.');
  }

  switch (i.data?.name) {
    case 'whois':
      return whois(db, i);
    case 'roster':
      return roster(db);
    case 'promote':
      return promote(env, db, viewer, i, baseUrl);
    case 'event':
      return upcomingEvents(db, baseUrl);
    case 'tournament':
      return activeTournaments(db, baseUrl);
    case 'medals':
      return memberMedals(db, i);
    case 'rank':
      return memberRank(db, i);
    default:
      return ephemeral(`Unknown command: ${i.data?.name}`);
  }
}

async function upcomingEvents(db: DB, baseUrl?: string) {
  const now = Math.floor(Date.now() / 1000);
  const rows = await db
    .select({ id: s.events.id, title: s.events.title, startsAt: s.events.startsAt, location: s.events.location })
    .from(s.events)
    .where(sql`${s.events.status} = 'scheduled' and ${s.events.startsAt} >= ${now}`)
    .orderBy(asc(s.events.startsAt))
    .limit(5);
  if (!rows.length) return reply('No upcoming events scheduled.');
  const lines = rows.map((e) => `• **${e.title}** — <t:${e.startsAt}:F> · ${e.location}`);
  const link = baseUrl ? `\n\n${baseUrl}/events` : '';
  return reply(`**Upcoming events**\n${lines.join('\n')}${link}`);
}

async function activeTournaments(db: DB, baseUrl?: string) {
  const rows = await db
    .select({
      name: s.tournaments.name,
      slug: s.tournaments.slug,
      status: s.tournaments.status,
      n: sql<number>`(select count(*) from tournament_entrants where tournament_entrants.tournament_id = tournaments.id)`,
    })
    .from(s.tournaments)
    .where(sql`${s.tournaments.status} != 'complete'`)
    .orderBy(desc(s.tournaments.createdAt))
    .limit(8);
  if (!rows.length) return reply('No active tournaments right now.');
  const label: Record<string, string> = {
    draft: 'Draft',
    registration: 'Registration open',
    seeding: 'Seeding',
    in_progress: 'In progress',
  };
  const lines = rows.map(
    (t) =>
      `• **${t.name}** — ${label[t.status] ?? t.status} · ${t.n} entered` +
      (baseUrl ? ` · ${baseUrl}/tournaments/${t.slug}` : ''),
  );
  return reply(`**Active tournaments**\n${lines.join('\n')}`);
}

async function memberMedals(db: DB, i: Interaction) {
  const targetId = optionValue<string>(i, 'member');
  if (!targetId) return ephemeral('Specify a member.');
  const user = await db.query.users.findFirst({ where: eq(s.users.discordId, targetId) });
  if (!user) return ephemeral('That person has no mustr account.');
  const rows = await db
    .select({ name: s.medals.name, awardedAt: s.memberMedals.awardedAt })
    .from(s.memberMedals)
    .innerJoin(s.medals, eq(s.medals.id, s.memberMedals.medalId))
    .where(eq(s.memberMedals.userId, user.id))
    .orderBy(desc(s.memberMedals.awardedAt));
  if (!rows.length) return reply(`**${memberName(user)}** has no medals yet.`);
  const lines = rows.map((m) => `🎖️ ${m.name}`);
  return reply(`**${memberName(user)}** — ${rows.length} medal${rows.length === 1 ? '' : 's'}\n${lines.join('\n')}`);
}

async function memberRank(db: DB, i: Interaction) {
  const targetId = optionValue<string>(i, 'member');
  if (!targetId) return ephemeral('Specify a member.');
  const user = await db.query.users.findFirst({ where: eq(s.users.discordId, targetId) });
  if (!user) return ephemeral('That person has no mustr account.');
  const rank = user.rankId ? await db.query.ranks.findFirst({ where: eq(s.ranks.id, user.rankId) }) : null;
  return reply(`**${memberName(user)}** — ${rank?.name ?? 'no rank'}`);
}

async function whois(db: DB, i: Interaction) {
  const targetId = optionValue<string>(i, 'member');
  if (!targetId) return ephemeral('Specify a member.');

  const user = await db.query.users.findFirst({ where: eq(s.users.discordId, targetId) });
  if (!user) return ephemeral('That person has no mustr account.');

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
      `**${memberName(user)}**`,
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

async function promote(env: Env, db: DB, viewer: Viewer, i: Interaction, baseUrl?: string) {
  if (!can(viewer, 'roster.promote')) {
    return ephemeral('You do not have permission to promote members.');
  }

  const targetId = optionValue<string>(i, 'member');
  if (!targetId) return ephemeral('Specify a member.');

  const target = await db.query.users.findFirst({ where: eq(s.users.discordId, targetId) });
  if (!target) return ephemeral('That person has no mustr account.');

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
  const client = await discordClient(env, db);
  const rankRoleSync = await syncMemberRankRoles(db, client, {
    userId: target.id,
    rankId: nextRank.id,
    actorId: viewer.id,
  });

  const roleNote = rankRoleSync.added.length
    ? `\nRoles added: ${rankRoleSync.added.join(', ')}`
    : '';

  await announce(
    env,
    {
      type: 'promotion',
      memberName: memberName(target),
      memberDiscordId: target.discordId,
      memberAvatarUrl: discordAvatar(target.discordId, target.avatar, 128),
      rankName: nextRank.name,
      rankImageUrl: nextRank.imageUrl,
      byName: memberName(viewer),
    },
    baseUrl,
  );

  return reply(
    `**${memberName(target)}** promoted to **${nextRank.name}**` +
      (currentRank ? ` (from ${currentRank.name})` : '') +
      roleNote,
  );
}
