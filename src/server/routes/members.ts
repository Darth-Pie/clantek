import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { can, outranks } from '../../shared/permissions';
import { DiscordRest, DiscordError } from '../discord/rest';
import { grantRole, revokeRole, syncMemberRankRoles, reconcileMember } from '../discord/sync';
import { deleteMediaByUrl } from './media';

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
      displayName: s.users.displayName,
      avatar: s.users.avatar,
      profileImageUrl: s.users.profileImageUrl,
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
        awardId: s.memberMedals.id,
        id: s.medals.id,
        name: s.medals.name,
        imageUrl: s.medals.imageUrl,
        citation: s.memberMedals.citation,
        // NULL awardedBy = handed out by the tenure sweep, not a person.
        awardedBy: s.memberMedals.awardedBy,
        awardedAt: s.memberMedals.awardedAt,
      })
      .from(s.memberMedals)
      .innerJoin(s.medals, eq(s.memberMedals.medalId, s.medals.id))
      .where(eq(s.memberMedals.userId, id))
      .orderBy(desc(s.memberMedals.awardedAt)),
    database.query.profiles.findFirst({ where: eq(s.profiles.userId, id) }),
  ]);

  return c.json({ member: { ...user, rank, roles, medals, bio: profile?.bio ?? null } });
});

/**
 * Edit a member's profile — display name, bio, and profile image. A member may
 * always edit their own; editing anyone else's needs roster.edit.
 *
 * Changing the display name also sets the member's Discord nickname (their
 * per-server name). Website stays the source of truth; the push is best-effort
 * and reported back, never blocking the save.
 *
 * profileImageUrl is a /media/avatars/… URL from a prior upload, or null to
 * clear it and revert to the Discord avatar. Replacing or clearing it deletes
 * the previous R2 object so orphans don't pile up.
 */
members.patch('/:id/profile', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const viewer = c.get('viewer')!;
  const isSelf = viewer.id === id;
  if (!isSelf && !can(viewer, 'roster.edit')) {
    return c.json({ error: 'You can only edit your own profile.' }, 403);
  }

  const body = await c.req.json<{
    bio?: string;
    displayName?: string;
    profileImageUrl?: string | null;
  }>();
  const nowSec = Math.floor(Date.now() / 1000);
  const database = db(c.env);

  const target = await database.query.users.findFirst({ where: eq(s.users.id, id) });
  if (!target) return c.json({ error: 'No such member' }, 404);

  let profileImageUrl = target.profileImageUrl;
  if (body.profileImageUrl !== undefined) {
    const next = body.profileImageUrl?.trim() || null;
    // Only accept a cleared value or one of our own uploaded avatar URLs — never
    // an arbitrary off-site URL, which would let this field point <img> tags at
    // anything and bypass the raster-only upload guard.
    if (next !== null && !next.startsWith('/media/avatars/')) {
      return c.json({ error: 'Invalid profile image.' }, 400);
    }
    if (next !== target.profileImageUrl) {
      await database.update(s.users).set({ profileImageUrl: next, updatedAt: nowSec }).where(eq(s.users.id, id));
      // Drop the image it replaced (best effort, off the request path).
      c.executionCtx.waitUntil(deleteMediaByUrl(c.env, target.profileImageUrl));
      profileImageUrl = next;
    }
  }

  let bio: string | undefined;
  if (body.bio !== undefined) {
    bio = (body.bio ?? '').slice(0, 2000);
    await database
      .insert(s.profiles)
      .values({ userId: id, bio, updatedAt: nowSec })
      .onConflictDoUpdate({ target: s.profiles.userId, set: { bio, updatedAt: nowSec } });
  }

  let displayName = target.displayName;
  let discordSync: { synced: boolean; warning?: string } | undefined;

  if (body.displayName !== undefined) {
    displayName = body.displayName.trim().slice(0, 32) || null;
    const changed = displayName !== target.displayName;
    await database
      .update(s.users)
      .set({ displayName, updatedAt: nowSec })
      .where(eq(s.users.id, id));

    if (changed) {
      // Push the new display name as the member's Discord nickname. An empty
      // value clears the nickname, reverting them to their Discord name.
      const client = rest(c.env);
      if (client) {
        try {
          await client.setNickname(
            target.discordId,
            displayName ?? '',
            `ClanTek: display name set by ${viewer.username}`,
          );
          discordSync = { synced: true };
        } catch (err) {
          discordSync = {
            synced: false,
            warning:
              err instanceof DiscordError && err.status === 403
                ? 'Saved here, but Discord refused the nickname change: the bot needs Manage Nicknames and a role above this member. (Discord also blocks changing the server owner’s nickname.)'
                : `Saved here, but the Discord nickname change failed: ${(err as Error).message}`,
          };
        }
      }

      await database.insert(s.auditLog).values({
        actorId: viewer.id,
        action: 'member.display_name',
        targetType: 'user',
        targetId: String(id),
        meta: { displayName, discordSynced: discordSync?.synced ?? false },
      });
    }
  }

  return c.json({ ok: true, bio, displayName, profileImageUrl, discordSync });
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

/**
 * Force this member's Discord roles back into line with the website now, rather
 * than waiting for the scheduled sweep. Adds mapped roles they should have,
 * removes mapped ones they shouldn't; unmanaged Discord roles are left alone.
 */
members.post('/:id/resync', requirePermission('discord.sync'), async (c) => {
  const id = Number(c.req.param('id'));
  const client = rest(c.env);
  if (!client) {
    return c.json({ ok: false, warning: 'Discord bot is not configured.' });
  }
  try {
    const r = await reconcileMember(db(c.env), client, id);
    return c.json({ ok: true, added: r.added.length, removed: r.removed.length });
  } catch (err) {
    return c.json({ ok: false, warning: `Discord re-sync failed: ${(err as Error).message}` });
  }
});

/**
 * Award a medal to a member, with an optional citation for why. A member can
 * hold any given medal only once, so re-awarding the same one is a 409 rather
 * than a silent duplicate.
 */
members.post('/:id/medals', requirePermission('medals.award'), async (c) => {
  const userId = Number(c.req.param('id'));
  const { medalId, citation } = await c.req.json<{ medalId: number; citation?: string }>();
  const viewer = c.get('viewer')!;
  const database = db(c.env);

  const [target, medal] = await Promise.all([
    database.query.users.findFirst({ where: eq(s.users.id, userId) }),
    database.query.medals.findFirst({ where: eq(s.medals.id, medalId) }),
  ]);
  if (!target) return c.json({ error: 'No such member' }, 404);
  if (!medal) return c.json({ error: 'No such medal' }, 404);

  const already = await database
    .select({ id: s.memberMedals.id })
    .from(s.memberMedals)
    .where(and(eq(s.memberMedals.userId, userId), eq(s.memberMedals.medalId, medalId)));
  if (already.length) {
    return c.json({ error: `${target.username} already has the “${medal.name}” medal.` }, 409);
  }

  const award = (
    await database
      .insert(s.memberMedals)
      .values({
        userId,
        medalId,
        citation: citation?.trim() || null,
        awardedBy: viewer.id,
      })
      .returning()
  )[0]!;

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'medal.award',
    targetType: 'user',
    targetId: String(userId),
    meta: { medalId, medalName: medal.name, citation: citation?.trim() || null },
    ip: c.req.header('cf-connecting-ip'),
  });

  return c.json({ ok: true, awardId: award.id }, 201);
});

/** Revoke a specific award (by member_medals id, not medal id). */
members.delete('/:id/medals/:awardId', requirePermission('medals.award'), async (c) => {
  const userId = Number(c.req.param('id'));
  const awardId = Number(c.req.param('awardId'));
  const viewer = c.get('viewer')!;
  const database = db(c.env);

  const award = await database.query.memberMedals.findFirst({
    where: and(eq(s.memberMedals.id, awardId), eq(s.memberMedals.userId, userId)),
  });
  if (!award) return c.json({ error: 'No such award on this member' }, 404);

  await database.delete(s.memberMedals).where(eq(s.memberMedals.id, awardId));

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'medal.revoke',
    targetType: 'user',
    targetId: String(userId),
    meta: { medalId: award.medalId, awardId },
    ip: c.req.header('cf-connecting-ip'),
  });

  return c.json({ ok: true });
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
