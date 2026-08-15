/**
 * Attendance & participation API.
 *
 * Check-in (self or officer, gated by the admin 'attendance' config mode), the
 * per-event attendance roster, the participation leaderboard (members-only, or
 * public when the admin opts in), a member's own score, the activity heatmap
 * (role-gated visibility), and the admin config.
 */

import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { AppContext } from '../env';
import { db, requireAuth, requirePermission } from '../middleware/auth';
import { memberName } from '../../shared/names';
import {
  ATTENDANCE_KEY,
  loadAttendanceConfig,
  checkIn,
  removeAttendance,
  memberScore,
  leaderboard,
  heatmap,
} from '../attendance';
import { sanitizeAttendanceConfig, selfCheckinOpen } from '../../shared/attendance';
import { awardActivityMedals } from '../medals/activity';

const attendance = new Hono<AppContext>();

const HEATMAP_DAYS = 371; // ~53 weeks, so the calendar always shows full weeks.

/** The non-sensitive config the Events page needs (mode, window, flags). */
attendance.get('/settings', requireAuth, async (c) => {
  const cfg = await loadAttendanceConfig(c.env, db(c.env));
  return c.json({
    mode: cfg.mode,
    checkinWindowHours: cfg.checkinWindowHours,
    recentWindowDays: cfg.recentWindowDays,
    heatmapEnabled: cfg.heatmapEnabled,
    leaderboardPublic: cfg.leaderboardPublic,
  });
});

/** The viewer's own participation score (recent + all-time). */
attendance.get('/me', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  const cfg = await loadAttendanceConfig(c.env, db(c.env));
  const score = await memberScore(db(c.env), viewer.id, cfg.recentWindowDays);
  return c.json({ score, recentWindowDays: cfg.recentWindowDays });
});

/** The leaderboard. ?window=all for all-time, else the recent window. Public
 *  only when the admin has opted in; otherwise members-only. */
attendance.get('/leaderboard', async (c) => {
  const cfg = await loadAttendanceConfig(c.env, db(c.env));
  const viewer = c.get('viewer');
  if (!cfg.leaderboardPublic && !viewer) return c.json({ error: 'Authentication required' }, 401);

  const all = c.req.query('window') === 'all';
  const rows = await leaderboard(db(c.env), { windowDays: all ? undefined : cfg.recentWindowDays, limit: 50 });
  return c.json({ leaderboard: rows, window: all ? 'all' : 'recent', recentWindowDays: cfg.recentWindowDays });
});

/** Self check-in for an event (gated by mode + the open window). */
attendance.post('/event/:id/checkin', requirePermission('events.view'), async (c) => {
  const viewer = c.get('viewer')!;
  const id = Number(c.req.param('id'));
  const database = db(c.env);
  const event = await database.query.events.findFirst({ where: eq(s.events.id, id) });
  if (!event) return c.json({ error: 'No such event' }, 404);

  const cfg = await loadAttendanceConfig(c.env, database);
  if (cfg.mode === 'officers') return c.json({ error: 'Self check-in is turned off — an officer marks attendance here.' }, 403);
  const now = Math.floor(Date.now() / 1000);
  if (!selfCheckinOpen(event, now, cfg.checkinWindowHours)) {
    return c.json({ error: 'Check-in isn’t open for this event yet (or has closed).' }, 400);
  }

  const res = await checkIn(database, { eventId: id, userId: viewer.id, source: 'self', eventStartsAt: event.startsAt });
  if (res.created) c.executionCtx.waitUntil(awardActivityMedals(database, { userId: viewer.id }).catch(() => {}));
  return c.json({ ok: true, attended: true });
});

/** Withdraw the viewer's own check-in. */
attendance.delete('/event/:id/checkin', requirePermission('events.view'), async (c) => {
  const viewer = c.get('viewer')!;
  const id = Number(c.req.param('id'));
  await removeAttendance(db(c.env), id, viewer.id);
  return c.json({ ok: true, attended: false });
});

/** Officer marks a member as attended. Body { userId }. */
attendance.post('/event/:id/mark', requirePermission('events.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const { userId } = await c.req.json<{ userId?: number }>();
  if (!Number.isInteger(userId)) return c.json({ error: 'A member is required.' }, 400);

  const database = db(c.env);
  const event = await database.query.events.findFirst({ where: eq(s.events.id, id) });
  if (!event) return c.json({ error: 'No such event' }, 404);
  const cfg = await loadAttendanceConfig(c.env, database);
  if (cfg.mode === 'self') return c.json({ error: 'Officer marking is turned off — members check themselves in here.' }, 403);

  const res = await checkIn(database, {
    eventId: id,
    userId: userId!,
    source: 'officer',
    markedBy: c.get('viewer')!.id,
    eventStartsAt: event.startsAt,
  });
  if (res.created) c.executionCtx.waitUntil(awardActivityMedals(database, { userId: userId! }).catch(() => {}));
  return c.json({ ok: true });
});

/** Officer removes a member's attendance. */
attendance.delete('/event/:id/member/:userId', requirePermission('events.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const userId = Number(c.req.param('userId'));
  await removeAttendance(db(c.env), id, userId);
  return c.json({ ok: true });
});

/** The attendance roster for one event — who showed up, and how they checked in. */
attendance.get('/event/:id', requirePermission('events.attendees'), async (c) => {
  const id = Number(c.req.param('id'));
  const rows = await db(c.env)
    .select({
      userId: s.eventAttendance.userId,
      source: s.eventAttendance.source,
      checkedInAt: s.eventAttendance.checkedInAt,
      username: s.users.username,
      globalName: s.users.globalName,
      displayName: s.users.displayName,
      avatar: s.users.avatar,
      profileImageUrl: s.users.profileImageUrl,
      discordId: s.users.discordId,
    })
    .from(s.eventAttendance)
    .innerJoin(s.users, eq(s.users.id, s.eventAttendance.userId))
    .where(eq(s.eventAttendance.eventId, id))
    .orderBy(asc(s.eventAttendance.checkedInAt));

  const attendees = rows.map((r) => ({
    id: r.userId,
    name: memberName({ displayName: r.displayName, globalName: r.globalName, username: r.username }),
    avatar: r.avatar,
    profileImageUrl: r.profileImageUrl,
    discordId: r.discordId,
    source: r.source,
    checkedInAt: r.checkedInAt,
  }));
  return c.json({ attendees });
});

/** A member's activity heatmap. Self always; others per the configured roles. */
attendance.get('/heatmap/:userId', requireAuth, async (c) => {
  const viewer = c.get('viewer')!;
  const userId = Number(c.req.param('userId'));
  const cfg = await loadAttendanceConfig(c.env, db(c.env));
  if (!cfg.heatmapEnabled) return c.json({ error: 'Activity heatmaps are turned off.' }, 404);

  const isSelf = viewer.id === userId;
  const canView = viewer.isGod || isSelf || viewer.roles.some((r) => cfg.heatmapViewRoleIds.includes(r.id));
  if (!canView) return c.json({ error: 'Forbidden' }, 403);

  const days = await heatmap(db(c.env), userId, HEATMAP_DAYS);
  return c.json({ days, window: HEATMAP_DAYS });
});

/** Admin config: mode, window, heatmap visibility, public leaderboard + role list. */
attendance.get('/config', requirePermission('settings.manage'), async (c) => {
  const database = db(c.env);
  const [config, roles] = await Promise.all([
    loadAttendanceConfig(c.env, database),
    database
      .select({ id: s.roles.id, name: s.roles.name, color: s.roles.color })
      .from(s.roles)
      .orderBy(asc(s.roles.sortOrder), asc(s.roles.name)),
  ]);
  return c.json({ config, roles });
});

attendance.put('/config', requirePermission('settings.manage'), async (c) => {
  const body = await c.req.json<{ config?: unknown }>();
  const clean = sanitizeAttendanceConfig(body.config);
  const viewer = c.get('viewer')!;
  await db(c.env)
    .insert(s.settings)
    .values({ key: ATTENDANCE_KEY, value: clean, updatedBy: viewer.id })
    .onConflictDoUpdate({
      target: s.settings.key,
      set: { value: clean, updatedBy: viewer.id, updatedAt: Math.floor(Date.now() / 1000) },
    });
  return c.json({ ok: true, config: clean });
});

export default attendance;
