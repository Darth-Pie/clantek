/**
 * The ban list — Discord ids blocked from signing in (see schema `bans` and the
 * OAuth callback, which checks this first). Managed by holders of `members.ban`.
 * Banning itself lives in members.ts (POST /members/:id/ban); this is the
 * list + unban side.
 */

import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { memberName } from '../../shared/names';

const bans = new Hono<AppContext>();

/** The current ban list, newest first, with the banning officer resolved to a name. */
bans.get('/', requirePermission('members.ban'), async (c) => {
  const rows = await db(c.env)
    .select({
      discordId: s.bans.discordId,
      username: s.bans.username,
      reason: s.bans.reason,
      bannedAt: s.bans.bannedAt,
      byName: s.users.displayName,
      byGlobal: s.users.globalName,
      byUsername: s.users.username,
    })
    .from(s.bans)
    .leftJoin(s.users, eq(s.users.id, s.bans.bannedBy))
    .orderBy(desc(s.bans.bannedAt));

  return c.json({
    bans: rows.map((r) => ({
      discordId: r.discordId,
      username: r.username,
      reason: r.reason,
      bannedAt: r.bannedAt,
      bannedBy: r.byUsername
        ? memberName({ displayName: r.byName, globalName: r.byGlobal, username: r.byUsername })
        : null,
    })),
  });
});

/**
 * Lift a ban: remove the id from the list, and clear any lingering 'banned'
 * record (→ retired) so the belt-and-suspenders status check stops blocking them.
 * They can then sign in again (as a member if in the guild, else an applicant).
 */
bans.delete('/:discordId', requirePermission('members.ban'), async (c) => {
  const discordId = c.req.param('discordId');
  const viewer = c.get('viewer')!;
  const database = db(c.env);

  await database.delete(s.bans).where(eq(s.bans.discordId, discordId));
  await database
    .update(s.users)
    .set({ status: 'retired', updatedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(s.users.discordId, discordId), eq(s.users.status, 'banned')));

  await database.insert(s.auditLog).values({
    actorId: viewer.id,
    action: 'member.unban',
    targetType: 'user',
    targetId: discordId,
    ip: c.req.header('cf-connecting-ip'),
  });
  return c.json({ ok: true });
});

export default bans;
