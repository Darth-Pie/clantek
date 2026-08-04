/**
 * Mirrors a ClanTek event into Discord: a native guild scheduled event (so
 * members can RSVP and get reminders) AND an announcement message in the
 * configured channel. Both are best-effort — a Discord failure is logged and
 * swallowed, never blocking the site action. Callers run this in ctx.waitUntil
 * and persist the returned ids so later edits/cancels can find them.
 *
 * The announcement channel is the same one the medal/promotion announcements
 * use (settings key 'announcements'); the native scheduled event needs the
 * bot's MANAGE_EVENTS permission.
 */

import { drizzle } from 'drizzle-orm/d1';
import * as s from '../../db/schema';
import type { Env } from '../env';
import { DiscordRest, type Embed } from './rest';
import { loadAnnouncementConfig } from './announce';

type EventRow = typeof s.events.$inferSelect;

const iso = (unixSec: number) => new Date(unixSec * 1000).toISOString();

function eventEmbed(event: EventRow, gameName: string | null): Embed {
  const lines = [
    event.description || undefined,
    `**When:** <t:${event.startsAt}:F> (<t:${event.startsAt}:R>)`,
    `**Where:** ${event.location}`,
    gameName ? `**Game:** ${gameName}` : undefined,
  ].filter(Boolean) as string[];
  return { color: 0x5865f2, title: `📅 ${event.title}`, description: lines.join('\n') };
}

export interface DiscordEventIds {
  discordEventId: string | null;
  discordMessageId: string | null;
}

/**
 * Create or update the Discord scheduled event and channel message for an
 * event. Reuses the ids already on the row when present (an edit), or creates
 * fresh ones. Returns the ids to persist. Never throws.
 */
export async function syncEventToDiscord(
  env: Env,
  event: EventRow,
  gameName: string | null,
): Promise<DiscordEventIds> {
  const ids: DiscordEventIds = {
    discordEventId: event.discordEventId,
    discordMessageId: event.discordMessageId,
  };
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return ids;

  const rest = new DiscordRest(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID);

  const scheduled = {
    name: event.title.slice(0, 100),
    description: event.description?.slice(0, 1000) || undefined,
    scheduled_start_time: iso(event.startsAt),
    scheduled_end_time: iso(event.endsAt),
    privacy_level: 2 as const,
    entity_type: 3 as const,
    entity_metadata: { location: event.location.slice(0, 100) },
  };

  try {
    if (ids.discordEventId) {
      await rest.modifyScheduledEvent(ids.discordEventId, scheduled);
    } else {
      ids.discordEventId = await rest.createScheduledEvent(scheduled);
    }
  } catch (err) {
    console.error('Scheduled-event sync failed', err);
  }

  try {
    const db = drizzle(env.DB, { schema: s });
    const channelId = (await loadAnnouncementConfig(db)).channelId;
    if (channelId) {
      const embed = eventEmbed(event, gameName);
      if (ids.discordMessageId) {
        await rest.editMessage(channelId, ids.discordMessageId, { embeds: [embed] });
      } else {
        ids.discordMessageId = await rest.createMessage(channelId, { embeds: [embed] });
      }
    }
  } catch (err) {
    console.error('Event announcement failed', err);
  }

  return ids;
}

/** Remove an event's Discord scheduled event and announcement message. Never throws. */
export async function removeEventFromDiscord(env: Env, event: EventRow): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return;
  const rest = new DiscordRest(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID);

  if (event.discordEventId) {
    try {
      await rest.deleteScheduledEvent(event.discordEventId);
    } catch (err) {
      console.error('Scheduled-event delete failed', err);
    }
  }
  if (event.discordMessageId) {
    try {
      const db = drizzle(env.DB, { schema: s });
      const channelId = (await loadAnnouncementConfig(db)).channelId;
      if (channelId) await rest.deleteMessage(channelId, event.discordMessageId);
    } catch (err) {
      console.error('Event message delete failed', err);
    }
  }
}
