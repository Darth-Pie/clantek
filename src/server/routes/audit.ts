/**
 * The activity log — who did what. Every mutation across the site already
 * writes an audit_log row (promotions, demotions, medal and war-record awards
 * and revocations, role changes, status changes, …); this route is the read
 * side, gated on audit.view so only trusted members can see it.
 *
 * News and event posts are deliberately absent from the useful view: those
 * already carry a visible author, so they don't need to surface here.
 */

import { Hono } from 'hono';
import { and, desc, eq, like, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requirePermission } from '../middleware/auth';
import { memberName } from '../../shared/names';

const audit = new Hono<AppContext>();

/**
 * A page of log entries, most recent first. Filters (all optional):
 *   action   — prefix match, so "medal" catches medal.award and medal.revoke,
 *              while "medal.revoke" is exact.
 *   actorId  — only what this member did.
 *   targetId — only entries about this member (targetType=user).
 * Paginated with limit/offset; the client loads more until a short page.
 */
audit.get('/', requirePermission('audit.view'), async (c) => {
  const database = db(c.env);
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 100);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const action = c.req.query('action')?.trim();
  const actorId = c.req.query('actorId') ? Number(c.req.query('actorId')) : null;
  const targetId = c.req.query('targetId')?.trim();

  const actor = alias(s.users, 'actor');
  const target = alias(s.users, 'target');

  const filters = [
    action ? like(s.auditLog.action, `${action}%`) : undefined,
    actorId ? eq(s.auditLog.actorId, actorId) : undefined,
    targetId ? eq(s.auditLog.targetId, targetId) : undefined,
  ].filter(Boolean);

  const rows = await database
    .select({
      id: s.auditLog.id,
      action: s.auditLog.action,
      reason: s.auditLog.reason,
      meta: s.auditLog.meta,
      source: s.auditLog.source,
      createdAt: s.auditLog.createdAt,
      targetType: s.auditLog.targetType,
      targetId: s.auditLog.targetId,
      actorId: actor.id,
      actorUsername: actor.username,
      actorGlobalName: actor.globalName,
      actorDisplayName: actor.displayName,
      actorDiscordId: actor.discordId,
      actorAvatar: actor.avatar,
      actorProfileImageUrl: actor.profileImageUrl,
      targetUserId: target.id,
      targetUsername: target.username,
      targetGlobalName: target.globalName,
      targetDisplayName: target.displayName,
    })
    .from(s.auditLog)
    .leftJoin(actor, eq(actor.id, s.auditLog.actorId))
    // Resolve the target's name only when it is a member; other target types
    // (news, ranks, …) reuse the numeric id space, so gate the join on user.
    .leftJoin(
      target,
      and(eq(s.auditLog.targetType, 'user'), eq(target.id, sql`cast(${s.auditLog.targetId} as integer)`)),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(s.auditLog.createdAt), desc(s.auditLog.id))
    .limit(limit)
    .offset(offset);

  const entries = rows.map((r) => ({
    id: r.id,
    action: r.action,
    reason: r.reason,
    meta: r.meta,
    source: r.source,
    createdAt: r.createdAt,
    targetType: r.targetType,
    targetId: r.targetId,
    // System actions (the tenure sweep, member.join) have no actor.
    actor: r.actorId
      ? {
          id: r.actorId,
          name: memberName({
            displayName: r.actorDisplayName,
            globalName: r.actorGlobalName,
            username: r.actorUsername ?? 'unknown',
          }),
          discordId: r.actorDiscordId,
          avatar: r.actorAvatar,
          profileImageUrl: r.actorProfileImageUrl,
        }
      : null,
    target: r.targetUserId
      ? {
          id: r.targetUserId,
          name: memberName({
            displayName: r.targetDisplayName,
            globalName: r.targetGlobalName,
            username: r.targetUsername ?? 'unknown',
          }),
        }
      : null,
  }));

  return c.json({ entries, limit, offset, hasMore: rows.length === limit });
});

/**
 * The distinct members who appear as an actor in the log — for the "by person"
 * filter dropdown. Only people who actually did something show up, so the list
 * stays short and relevant (no full-roster dump). Ordered by name.
 */
audit.get('/actors', requirePermission('audit.view'), async (c) => {
  const database = db(c.env);
  const rows = await database
    .selectDistinct({
      id: s.users.id,
      username: s.users.username,
      globalName: s.users.globalName,
      displayName: s.users.displayName,
    })
    .from(s.auditLog)
    .innerJoin(s.users, eq(s.users.id, s.auditLog.actorId));

  const actors = rows
    .map((r) => ({
      id: r.id,
      name: memberName({
        displayName: r.displayName,
        globalName: r.globalName,
        username: r.username ?? 'unknown',
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return c.json({ actors });
});

export default audit;
