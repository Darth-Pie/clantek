/**
 * In-app notifications — the event catalog and the role-targeting config.
 *
 * A notification is created for an "event" (a thing that happened) and is shown
 * only to members holding one of the roles an admin assigned to that event. The
 * assignment lives in settings['notificationRules'] as { eventKey: roleId[] };
 * an event with no roles is effectively off (nothing is created). This module is
 * the authority on the event set and the config shape, shared by the emit helper,
 * the admin config page, and the bell.
 */

export interface NotificationEvent {
  key: string;
  label: string;
  description: string;
}

/** The events that can be routed to roles. A key only fires where the server
 *  calls emitNotification for it; unwired keys are harmless config placeholders. */
export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  {
    key: 'applicant.pending',
    label: 'New applicant awaiting approval',
    description: 'Someone signed in and is waiting on a decision — notify the roles that approve members.',
  },
  {
    key: 'member.approved',
    label: 'Applicant approved',
    description: 'An applicant was approved and became a full member.',
  },
  {
    key: 'member.banned',
    label: 'Member banned',
    description: 'A member was banned from the site.',
  },
  {
    key: 'news.published',
    label: 'News published',
    description: 'A news post went live on the feed.',
  },
];

export const NOTIFICATION_EVENT_KEYS = NOTIFICATION_EVENTS.map((e) => e.key);

/** eventKey → the role ids that should receive it. */
export type NotificationRules = Record<string, number[]>;

/** Keep only known event keys, positive integer role ids, de-duplicated. */
export function sanitizeNotificationRules(raw: unknown): NotificationRules {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: NotificationRules = {};
  for (const key of NOTIFICATION_EVENT_KEYS) {
    const v = o[key];
    if (!Array.isArray(v)) continue;
    const ids = [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
    if (ids.length) out[key] = ids;
  }
  return out;
}
