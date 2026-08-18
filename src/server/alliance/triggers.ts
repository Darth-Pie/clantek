/**
 * Alliance triggers — turn real mustr happenings into cross-org broadcasts.
 *
 * Kept separate from the generic federation engine (federation.ts) so the engine
 * stays feature-agnostic: this is where an event/announcement gets formatted into
 * an AllianceBroadcast and fanned out. Everything here is best-effort and safe to
 * call inside ctx.waitUntil.
 */

import type { Env } from '../env';
import * as s from '../../db/schema';
import { loadConfig } from '../config';
import { makeBroadcast, fanOut } from './federation';

type EventRow = typeof s.events.$inferSelect;

/**
 * Fan an event out to allied orgs. `cancelled` sends a short cancellation notice
 * instead of the full details. Discord `<t:unix:F>` timestamps survive the inbound
 * sanitizer (it only strips @/# mention tokens), so each ally sees the time in
 * their own locale.
 */
export async function broadcastEvent(env: Env, event: EventRow, opts: { cancelled?: boolean } = {}): Promise<void> {
  try {
    const cfg = await loadConfig(env);
    const url = cfg.siteUrl ? `${cfg.siteUrl}/events` : undefined;

    if (opts.cancelled) {
      const b = await makeBroadcast(env, 'event', `Event cancelled: ${event.title}`, `${event.title} has been cancelled.`, url);
      await fanOut(env, b);
      return;
    }

    const lines = [
      `📅 <t:${event.startsAt}:F> (<t:${event.startsAt}:R>)`,
      event.location ? `📍 ${event.location}` : '',
      event.description ?? '',
    ].filter(Boolean);

    const b = await makeBroadcast(env, 'event', event.title, lines.join('\n'), url);
    await fanOut(env, b);
  } catch (err) {
    console.error('Alliance event broadcast failed', err);
  }
}
