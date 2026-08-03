import { Hono } from 'hono';
import { asc, desc, eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { outranks } from '../../shared/permissions';
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

  const [rank, roles, medals] = await Promise.all([
    user.rankId ? database.query.ranks.findFirst({ where: eq(s.ranks.id, user.rankId) }) : null,
    database
      .select({ id: s.roles.id, name: s.roles.name, color: s.roles.color })
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
  ]);

  return c.json({ member: { ...user, rank, roles, medals } });
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
