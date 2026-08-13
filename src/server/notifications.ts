/**
 * Notification emit helper — creates a role-targeted, in-app notification for an
 * event, using the roles an admin assigned to it (settings['notificationRules']).
 *
 * Best-effort by design: it reads the config, and if no roles are configured for
 * the event it does nothing; any failure is swallowed so a notification can never
 * break the action that triggered it (approving a member must not fail because
 * the notifications table hiccuped).
 */

import { eq } from 'drizzle-orm';
import * as s from '../db/schema';
import { db } from './middleware/auth';
import { sanitizeNotificationRules, type NotificationRules } from '../shared/notifications';
import type { Env } from './env';

export const NOTIFICATION_RULES_KEY = 'notificationRules';

export async function loadNotificationRules(env: Env): Promise<NotificationRules> {
  const row = await db(env).query.settings.findFirst({ where: eq(s.settings.key, NOTIFICATION_RULES_KEY) });
  return sanitizeNotificationRules(row?.value);
}

export async function emitNotification(
  env: Env,
  type: string,
  n: { title: string; body?: string; link?: string },
): Promise<void> {
  try {
    const rules = await loadNotificationRules(env);
    const roleIds = rules[type] ?? [];
    if (roleIds.length === 0) return; // nobody is configured to receive it
    await db(env)
      .insert(s.notifications)
      .values({
        type,
        title: n.title.slice(0, 200),
        body: n.body ? n.body.slice(0, 500) : null,
        link: n.link ? n.link.slice(0, 300) : null,
        roleIds,
      });
  } catch {
    /* notifications are best-effort — never surface to the triggering request */
  }
}
