/**
 * In-app notifications (see shared/notifications.ts for the model).
 *
 * GET / and POST /read serve any signed-in member their own role-gated feed and
 * read state. The visibility rule is applied here, in JS, over the most recent
 * rows: a member sees a notification if they hold one of its target roles (god
 * bypasses). GET/PUT /rules is the admin config (which role gets which event),
 * gated on settings.manage.
 */

import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { NOTIFICATION_EVENTS, sanitizeNotificationRules } from '../../shared/notifications';
import { loadNotificationRules, NOTIFICATION_RULES_KEY } from '../notifications';
import { memberName } from '../../shared/names';

const notifications = new Hono<AppContext>();

const RECENT_LIMIT = 60;

/** Resolve reviewer ids → { id: {id, name} } for the set of notification rows. */
async function reviewerMap(database: ReturnType<typeof db>, rows: { reviewedBy: number | null }[]) {
  const ids = [...new Set(rows.map((r) => r.reviewedBy).filter((x): x is number => x != null))];
  if (ids.length === 0) return new Map<number, { id: number; name: string }>();
  const users = await database
    .select({
      id: s.users.id,
      username: s.users.username,
      globalName: s.users.globalName,
      displayName: s.users.displayName,
    })
    .from(s.users)
    .where(inArray(s.users.id, ids));
  return new Map(
    users.map((u) => [
      u.id,
      { id: u.id, name: memberName({ displayName: u.displayName, globalName: u.globalName, username: u.username }) },
    ]),
  );
}

/** The recent notifications this viewer may see (role-gated), newest first. */
async function visibleFor(
  database: ReturnType<typeof db>,
  viewer: { id: number; isGod: boolean; roles: { id: number }[] },
) {
  const rows = await database
    .select()
    .from(s.notifications)
    .orderBy(desc(s.notifications.createdAt))
    .limit(RECENT_LIMIT);
  const mine = new Set(viewer.roles.map((r) => r.id));
  return rows.filter(
    (n) => viewer.isGod || (Array.isArray(n.roleIds) && n.roleIds.some((id) => mine.has(id))),
  );
}

notifications.get('/', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  const database = db(c.env);
  const visible = await visibleFor(database, viewer);
  const ids = visible.map((n) => n.id);
  const reads = ids.length
    ? await database
        .select({ notificationId: s.notificationReads.notificationId })
        .from(s.notificationReads)
        .where(and(eq(s.notificationReads.userId, viewer.id), inArray(s.notificationReads.notificationId, ids)))
    : [];
  const readSet = new Set(reads.map((r) => r.notificationId));
  const reviewers = await reviewerMap(database, visible);
  const list = visible.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt,
    read: readSet.has(n.id),
    reviewedAt: n.reviewedAt,
    reviewer: n.reviewedBy != null ? (reviewers.get(n.reviewedBy) ?? null) : null,
  }));
  return c.json({ notifications: list, unread: list.filter((n) => !n.read).length });
});

/**
 * Claim a notification as reviewed — first-come, one reviewer. An atomic update
 * (WHERE reviewed_by IS NULL) means two people clicking at once can't both win;
 * the loser just gets back whoever actually claimed it. Any recipient who can
 * see the notification may review it (god included); everyone then sees the name.
 */
notifications.post('/:id/review', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  const database = db(c.env);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Bad id' }, 400);

  // Must be one this viewer is allowed to see.
  const visible = await visibleFor(database, viewer);
  if (!visible.some((n) => n.id === id)) return c.json({ error: 'Not found' }, 404);

  const now = Math.floor(Date.now() / 1000);
  await database
    .update(s.notifications)
    .set({ reviewedBy: viewer.id, reviewedAt: now })
    .where(and(eq(s.notifications.id, id), isNull(s.notifications.reviewedBy)));

  // Read back the winner (may be someone else if they beat us to it).
  const row = await database.query.notifications.findFirst({ where: eq(s.notifications.id, id) });
  const reviewers = await reviewerMap(database, row ? [row] : []);
  return c.json({
    ok: true,
    reviewedAt: row?.reviewedAt ?? null,
    reviewer: row?.reviewedBy != null ? (reviewers.get(row.reviewedBy) ?? null) : null,
  });
});

/** Mark read. Body { ids?: number[] } — omit to mark every visible one read. */
notifications.post('/read', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  const database = db(c.env);
  const body = await c.req.json<{ ids?: number[] }>().catch(() => ({}) as { ids?: number[] });
  let ids = (await visibleFor(database, viewer)).map((n) => n.id);
  if (Array.isArray(body.ids)) ids = ids.filter((id) => body.ids!.includes(id));
  if (ids.length) {
    await database
      .insert(s.notificationReads)
      .values(ids.map((id) => ({ userId: viewer.id, notificationId: id })))
      .onConflictDoNothing();
  }
  return c.json({ ok: true });
});

/** Admin config: which role receives which event. */
notifications.get('/rules', requirePermission('settings.manage'), async (c) => {
  const database = db(c.env);
  const [rules, roles] = await Promise.all([
    loadNotificationRules(c.env),
    database
      .select({ id: s.roles.id, name: s.roles.name, color: s.roles.color })
      .from(s.roles)
      .orderBy(asc(s.roles.sortOrder), asc(s.roles.name)),
  ]);
  return c.json({ rules, roles, events: NOTIFICATION_EVENTS });
});

notifications.put('/rules', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ rules?: unknown }>();
  const clean = sanitizeNotificationRules(body.rules);
  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: NOTIFICATION_RULES_KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });
  return c.json({ ok: true, rules: clean });
});

export default notifications;
