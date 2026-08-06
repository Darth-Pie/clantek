/**
 * Discord announcements.
 *
 * When something worth celebrating happens on the site — a medal or war record
 * awarded, a promotion — the bot posts an embed to a configured channel and
 * pings the member. Everything here is best-effort and fire-and-forget: an
 * announcement failure (misconfigured channel, missing permission, rate limit)
 * must never affect the action that triggered it, so callers invoke this inside
 * ctx.waitUntil and it swallows its own errors.
 *
 * Which events fire, and where, is set in the admin panel (settings key
 * 'announcements'); nothing posts until a channel is chosen and the event is
 * enabled.
 */

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as s from '../../db/schema';
import type { Env } from '../env';
import { type Embed } from './rest';
import { discordClient } from '../config';

export type AnnouncementEventKey = 'medalAward' | 'warRecordAward' | 'promotion';

export interface AnnouncementConfig {
  channelId: string | null;
  events: Record<AnnouncementEventKey, boolean>;
}

export const DEFAULT_ANNOUNCEMENTS: AnnouncementConfig = {
  channelId: null,
  events: { medalAward: false, warRecordAward: false, promotion: false },
};

type DB = ReturnType<typeof drizzle<typeof s>>;

export async function loadAnnouncementConfig(db: DB): Promise<AnnouncementConfig> {
  const row = await db.query.settings.findFirst({ where: eq(s.settings.key, 'announcements') });
  const stored = (row?.value as Partial<AnnouncementConfig> | undefined) ?? {};
  return {
    channelId: stored.channelId ?? null,
    events: { ...DEFAULT_ANNOUNCEMENTS.events, ...(stored.events ?? {}) },
  };
}

interface MemberRef {
  memberName: string;
  memberDiscordId: string;
  memberAvatarUrl: string;
}

export type AnnounceEvent =
  | (MemberRef & { type: 'medalAward'; medalName: string; medalImageUrl: string | null; citation: string | null })
  | (MemberRef & {
      type: 'warRecordAward';
      recordName: string;
      recordImageUrl: string | null;
      gameName: string | null;
      citation: string | null;
    })
  | (MemberRef & { type: 'promotion'; rankName: string; rankImageUrl: string | null; byName: string | null });

const COLORS = { medalAward: 0xc0392b, warRecordAward: 0xd4af37, promotion: 0x2f9e5f };

/** Absolute-ise a stored /media/ URL so Discord can fetch it; pass through http(s) URLs. */
function absolute(url: string | null, baseUrl?: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return baseUrl ? `${baseUrl}${url}` : undefined;
}

function buildEmbed(event: AnnounceEvent, baseUrl?: string): Embed {
  const author = { name: event.memberName, icon_url: event.memberAvatarUrl };
  switch (event.type) {
    case 'medalAward':
      return {
        author,
        color: COLORS.medalAward,
        title: '🎖️ Medal awarded',
        description: `**${event.memberName}** was awarded the **${event.medalName}** medal.${
          event.citation ? `\n*“${event.citation}”*` : ''
        }`,
        thumbnail: absolute(event.medalImageUrl, baseUrl)
          ? { url: absolute(event.medalImageUrl, baseUrl)! }
          : undefined,
      };
    case 'warRecordAward':
      return {
        author,
        color: COLORS.warRecordAward,
        title: '🏆 War record awarded',
        description: `**${event.memberName}** earned the **${event.recordName}** war record${
          event.gameName ? ` (${event.gameName})` : ''
        }.${event.citation ? `\n*“${event.citation}”*` : ''}`,
        thumbnail: absolute(event.recordImageUrl, baseUrl)
          ? { url: absolute(event.recordImageUrl, baseUrl)! }
          : undefined,
      };
    case 'promotion':
      return {
        author,
        color: COLORS.promotion,
        title: '⬆️ Promotion',
        description: `**${event.memberName}** was promoted to **${event.rankName}**.${
          event.byName ? `\n_by ${event.byName}_` : ''
        }`,
        thumbnail: absolute(event.rankImageUrl, baseUrl)
          ? { url: absolute(event.rankImageUrl, baseUrl)! }
          : undefined,
      };
  }
}

/**
 * Post an announcement if the event is enabled and a channel is configured.
 * Safe to call unconditionally inside ctx.waitUntil — it no-ops without a bot,
 * channel, or when the event is switched off, and never throws.
 */
export async function announce(env: Env, event: AnnounceEvent, baseUrl?: string): Promise<void> {
  try {
    const db = drizzle(env.DB, { schema: s });
    const rest = await discordClient(env, db);
    if (!rest) return;
    const config = await loadAnnouncementConfig(db);
    if (!config.channelId || !config.events[event.type]) return;

    await rest.createMessage(config.channelId, {
      content: `<@${event.memberDiscordId}>`,
      embeds: [buildEmbed(event, baseUrl)],
      allowed_mentions: { users: [event.memberDiscordId] },
    });
  } catch (err) {
    console.error('Announcement failed', err);
  }
}
