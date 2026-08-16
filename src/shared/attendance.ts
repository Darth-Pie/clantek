/**
 * Attendance & participation — shared config shape and helpers.
 *
 * The config (settings key 'attendance') controls who can check in, how long
 * self check-in stays open after an event, the recent-activity window, and who
 * may view other members' activity heatmaps. The sanitizer is the authority on
 * shape, shared by the server routes and the admin UI.
 */

export type AttendanceMode = 'self' | 'officers' | 'both';
export const ATTENDANCE_MODES: AttendanceMode[] = ['self', 'officers', 'both'];

export interface AttendanceConfig {
  /** Who can mark that a member attended: the member ('self'), officers only, or both. */
  mode: AttendanceMode;
  /** Hours after an event ends that self check-in stays open. */
  checkinWindowHours: number;
  /** The recent-activity window, in days, for the "recent" participation score. */
  recentWindowDays: number;
  /** Whether profile activity heatmaps are shown at all. */
  heatmapEnabled: boolean;
  /** Role ids allowed to view OTHER members' heatmaps. Members always see their
   *  own; a god always can. Empty = only the member (and gods) see it. */
  heatmapViewRoleIds: number[];
  /** When true, the attendance leaderboard is readable by logged-out visitors
   *  (for a public "active community" page). Off by default — members only. */
  leaderboardPublic: boolean;
  /** When true, a Discord Gateway listener (a Durable Object) counts members'
   *  chat activity into the heatmap. Off by default — it holds a persistent
   *  bot connection, so it only runs once an admin opts in. */
  discordActivity: boolean;
}

export const DEFAULT_ATTENDANCE: AttendanceConfig = {
  mode: 'both',
  checkinWindowHours: 6,
  recentWindowDays: 90,
  heatmapEnabled: true,
  heatmapViewRoleIds: [],
  leaderboardPublic: false,
  discordActivity: false,
};

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function sanitizeAttendanceConfig(raw: unknown): AttendanceConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mode = ATTENDANCE_MODES.includes(o.mode as AttendanceMode)
    ? (o.mode as AttendanceMode)
    : DEFAULT_ATTENDANCE.mode;
  const roleIds = Array.isArray(o.heatmapViewRoleIds)
    ? [...new Set(o.heatmapViewRoleIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50)
    : [];
  return {
    mode,
    checkinWindowHours: clampInt(o.checkinWindowHours, 0, 168, DEFAULT_ATTENDANCE.checkinWindowHours),
    recentWindowDays: clampInt(o.recentWindowDays, 7, 3650, DEFAULT_ATTENDANCE.recentWindowDays),
    heatmapEnabled: o.heatmapEnabled !== false,
    heatmapViewRoleIds: roleIds,
    leaderboardPublic: o.leaderboardPublic === true,
    discordActivity: o.discordActivity === true,
  };
}

/** Unix day number (UTC): floor(unixSeconds / 86400). The heatmap's day key. */
export const SECONDS_PER_DAY = 86400;
export function unixDay(unixSeconds: number): number {
  return Math.floor(unixSeconds / SECONDS_PER_DAY);
}

/**
 * Is self check-in open for an event right now? Open from the event's start
 * until `checkinWindowHours` after it ends — you can't check in to something
 * that hasn't started, and the window closes a while after it wraps.
 */
export function selfCheckinOpen(
  event: { startsAt: number; endsAt: number },
  nowSec: number,
  windowHours: number,
): boolean {
  return nowSec >= event.startsAt && nowSec <= event.endsAt + windowHours * 3600;
}
