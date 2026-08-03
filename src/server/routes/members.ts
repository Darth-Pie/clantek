import { Hono } from 'hono';
import { asc, desc, eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { can, outranks } from '../../shared/permissions';
import { DiscordRest } from '../discord/rest';
import { grantRole, revokeRole, syncMemberRankRoles } from '../discord/sync';

const members = new Hono<AppContext>();

function rest(env: AppContext['Bindings']): DiscordRest | null {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;
  return new DiscordRest(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID);
}

members.get('/', requireAuth, async (c) => {
  const rows = await db(c.env)
    .select({
      id: s.users.id,
      discordId: s.users.discordId,
      username: s.users.username,
      globalName: s.users.globalName,
      avatar: s.users.avatar,
      status: s.users.status,
      joinedAt: s.users.joinedAt,
      rankId: s.ranks.id,
      rankName: s.ranks.name,
      rankOrder: s.ranks.sortOrder,
    })
    .from(s.users)
    .leftJoin(s.ranks, eq(s.users.rankId, s.ranks.id))
    .orderBy(desc(s.ranks.sortOrder), asc(s.users.username));

  return c.json({ members: rows });
});

members.get('/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const database = db(c.env);

  const user = await database.query.users.findFirst({ where: eq(s.users.id, id) });
  if (!user) return c.json({ error: 'No such member' }, 404);

  const [rank, roles, medals, profile] = await Promise.all([
    user.rankId ? database.query.ranks.findFirst({ where: eq(s.ranks.id, user.rankId) }) : null,
    database
      .select({
        id: s.roles.id,
        name: s.roles.name,
        color: s.roles.color,
        source: s.userRoles.source,
      })
      .from(s.userRoles)
      .innerJoin(s.roles, eq(s.userRoles.roleId, s.roles.id))
      .where(eq(s.userRoles.userId, id)),
    database
      .select({
        id: s.medals.id,
        name: s.medals.name,
        imageUrl: s.medals.imageUrl,
        citation: s.memberMedals.citation,
        awardedAt: s.memberMedals.awardedAt,
      })
      .from(s.memberMedals)
      .innerJoin(s.medals, eq(s.memberMedals.medalId, s.medals.id))
      .where(eq(s.memberMedals.userId, id)),
    database.query.profiles.findFirst({ where: eq(s.profiles.userId, id) }),
  ]);

  return c.json({ member: { ...user, rank, roles, medals, bio: profile?.bio ?? null } });
});

/**
 * Edit a member's bio. A member may always edit their own; editing anyone
 * else's needs roster.edit. This is the one self-service field on the profile.
 */
members.patch('/:id/profile', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const viewer = c.get('viewer')!;
  const isSelf = viewer.id === id;
  if (!isSelf && !can(viewer, 'roster.edit')) {
    return c.json({ error: 'You can only edit your own profile.' }, 403);
  }

  const { bio } = await c.req.json<{ bio: string }>();
  const clean = (bio ?? '').slice(0, 2000);
  const nowSec = Math.floor(Date.now() / 1000);
  const database = db(c.env);

  await database
    .insert(s.profiles)
    .values({ userId: id, bio: clean, updatedAt: nowSec })
    .onConflictDoUpdate({ target: s.profiles.userId, set: { bio: clean, updatedAt: nowSec } });

  return c.json({ ok: true, bio: clean });
});

/**
 * Change a member's status (active/inactive/loa/retired/banned). "Remove" from
 * the roster is a status change to retired, which keeps history. Banning needs
 * the stronger roster.remove; softer states need roster.edit. You cannot change
 * the status of someone who outranks you.
 */
members.patch('/:id/status', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const viewer = c.get('viewer')!;
  const { status } = await c.req.json<{ status: string }>();

  const allowed = ['active', 'inactive', 'loa', 'retired', 'banned'] as const;
  if (!allowed.includes(status as (typeof allowed)[number])) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const needsRemove = status === 'banned' || status === 'retired';
  if (!can(viewer, needsRemove ? 'roster.remove' : 'roster.edit')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const database = db(c.env);
  const target = await database.query.users.findFirst({ where: eq(s.users.id, id) });
  if (!target) return c.json({ error: 'No such member' }, 404);

  const targetRank = target.rankId
    ? await database.query.ranks.findFirst({ where: eq(s.ranks.id, target.rankId) })
    : null;
  if (!outranks(viewer, targetRank?.sortOrder ?? null)) {
    return c.json({ error: 'You cannot change the status of someone at or above your rank.' }, 403);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  await database
    .update(s.users)
    .set({ status: status as (typeof allowed)[number], updatedAt: nowSec })
    .where(eq(s.users.id, id));

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'member.status',
    targetType: 'user',
    targetId: String(id),
    meta: { from: target.status, to: status },
    ip: c.req.header('cf-connecting-ip'),
  });

  return c.json({ ok: true, status });
});

/** Set a member's rank outright (the ladder-step version lives in Discord's /promote). */
members.put('/:id/rank', requirePermission('roster.promote'), async (c) => {
  const id = Number(c.req.param('id'));
  const { rankId } = await c.req.json<{ rankId: number | null }>();
  const viewer = c.get('viewer')!;
  const database = db(c.env);

  const target = await database.query.users.findFirst({ where: eq(s.users.id, id) });
  if (!target) return c.json({ error: 'No such member' }, 404);

  const currentRank = target.rankId
    ? await database.query.ranks.findFirst({ where: eq(s.ranks.id, target.rankId) })
    : null;
  if (!outranks(viewer, currentRank?.sortOrder ?? null)) {
    return c.json({ error: 'You can only change ranks below your own' }, 403);
  }

  const newRank = rankId
    ? await database.query.ranks.findFirst({ where: eq(s.ranks.id, rankId) })
    : null;
  if (rankId && !newRank) return c.json({ error: 'No such rank' }, 404);
  if (newRank && !outranks(viewer, newRank.sortOrder)) {
    return c.json({ error: 'You cannot assign a rank at or above your own' }, 403);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  await database
    .update(s.users)
    .set({ rankId: newRank?.id ?? null, promotedAt: nowSec, updatedAt: nowSec })
    .where(eq(s.users.id, id));

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'member.rank_change',
    targetType: 'user',
    targetId: String(id),
    meta: { from: currentRank?.name ?? null, to: newRank?.name ?? null },
    ip: c.req.header('cf-connecting-ip'),
  });

  // Apply the new rank's roles (and drop the old rank's), cascading to Discord.
  const rankRoleSync = await syncMemberRankRoles(database, rest(c.env), {
    userId: id,
    rankId: newRank?.id ?? null,
    actorId: viewer.id,
  });

  return c.json({ ok: true, rank: newRank ?? null, rankRoleSync });
});

/**
 * Grant a role. If the role is mapped to a Discord role, this also updates
 * Discord — which is what makes website roles gate Discord channels.
 */
members.post('/:id/roles', requirePermission('roles.assign'), async (c) => {
  const userId = Number(c.req.param('id'));
  const { roleId, reason } = await c.req.json<{ roleId: number; reason?: string }>();
  const viewer = c.get('viewer')!;

  const result = await grantRole(db(c.env), rest(c.env), {
    userId,
    roleId,
    actorId: viewer.id,
    reason: reason ?? `Granted by ${viewer.username} via ClanTek`,
  });

  return c.json({ ok: true, ...result });
});

members.delete('/:id/roles/:roleId', requirePermission('roles.assign'), async (c) => {
  const userId = Number(c.req.param('id'));
  const roleId = Number(c.req.param('roleId'));
  const viewer = c.get('viewer')!;

  const result = await revokeRole(db(c.env), rest(c.env), {
    userId,
    roleId,
    actorId: viewer.id,
    reason: `Revoked by ${viewer.username} via ClanTek`,
  });

  return c.json({ ok: true, ...result });
});

export default members;
