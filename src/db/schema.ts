import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const now = sql`(unixepoch())`;

/* ------------------------------------------------------------------ *
 * Identity
 *
 * Discord snowflakes exceed Number.MAX_SAFE_INTEGER, so every *_id that
 * comes from Discord is TEXT. Never parse these into a JS number.
 * ------------------------------------------------------------------ */

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    discordId: text('discord_id').notNull().unique(),
    username: text('username').notNull(),
    globalName: text('global_name'),
    // Clan/game name a member sets for themselves. When present it is shown in
    // place of the Discord name everywhere; see shared/names.ts for the order.
    displayName: text('display_name'),
    avatar: text('avatar'), // Discord avatar hash, not a URL
    // A member-chosen profile image (an R2 /media/avatars/… URL). When set it
    // overrides the Discord avatar everywhere the member is shown; NULL falls
    // back to the Discord avatar. See shared/avatar.ts for the resolution order.
    profileImageUrl: text('profile_image_url'),
    email: text('email'),

    rankId: integer('rank_id').references(() => ranks.id, { onDelete: 'set null' }),

    // Bypasses every permission check. Seeded for the founder; see seed.sql.
    isGod: integer('is_god', { mode: 'boolean' }).notNull().default(false),

    // When Discord says this member joined the guild — the authoritative basis
    // for tenure medals. Captured at login and backfilled by the reconcile
    // sweep; falls back to joinedAt (site-join) when Discord hasn't been read
    // for them yet.
    guildJoinedAt: integer('guild_joined_at'),

    status: text('status', { enum: ['active', 'inactive', 'loa', 'retired', 'banned'] })
      .notNull()
      .default('active'),

    recruiterId: integer('recruiter_id'),

    joinedAt: integer('joined_at').notNull().default(now),
    lastSeenAt: integer('last_seen_at'),
    // When the Discord reconcile sweep last checked this member. The cron
    // processes members least-recently-reconciled first, rotating through the
    // roster a bounded batch at a time (see discord/sync.ts reconcileBatch).
    lastReconciledAt: integer('last_reconciled_at'),
    promotedAt: integer('promoted_at'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [
    index('users_rank_idx').on(t.rankId),
    index('users_status_idx').on(t.status),
  ],
);

export const profiles = sqliteTable('profiles', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  bio: text('bio'),
  location: text('location'),
  timezone: text('timezone'),
  // { "steam": "...", "xbox": "...", "psn": "..." }
  gamertags: text('gamertags', { mode: 'json' }).$type<Record<string, string>>(),
  updatedAt: integer('updated_at').notNull().default(now),
});

/* ------------------------------------------------------------------ *
 * Hierarchy
 *
 * The 2003 version stored ranks as 21 fixed columns (name_0..name_20) in
 * a single row. Here they are rows: add, delete, and reorder freely.
 * ------------------------------------------------------------------ */

export const ranks = sqliteTable(
  'ranks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    abbreviation: text('abbreviation'),
    imageUrl: text('image_url'),

    // 0 = lowest. Gaps are fine; reorder by rewriting these.
    sortOrder: integer('sort_order').notNull(),

    // Carried over from the original's auto-promotion criteria. 0 = ignored.
    reqDays: integer('req_days').notNull().default(0),
    reqWins: integer('req_wins').notNull().default(0),

    // Rank handed to new recruits on first Discord login. Exactly one should be true.
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),

    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [uniqueIndex('ranks_sort_order_idx').on(t.sortOrder)],
);

/* ------------------------------------------------------------------ *
 * Permissions
 *
 * A role is a bundle of permission strings AND (optionally) the mirror of
 * a Discord role. Setting discordRoleId makes membership changes here
 * push to Discord, and lets a Discord-side change pull back in.
 * ------------------------------------------------------------------ */

export const roles = sqliteTable('roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  color: text('color'), // hex, for admin UI chips

  discordRoleId: text('discord_role_id').unique(),

  sortOrder: integer('sort_order').notNull().default(0),

  // System roles cannot be deleted through the admin UI (they can be renamed).
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),

  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
});

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    // A Permission literal from src/shared/permissions.ts
    permission: text('permission').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const userRoles = sqliteTable(
  'user_roles',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    // How the member came to hold this role. 'manual' grants are permanent
    // until revoked by hand; 'rank' grants are reconciled when the member's
    // rank changes. A manual grant always wins, so promoting/demoting never
    // strips a role an admin gave on purpose.
    source: text('source', { enum: ['manual', 'rank'] })
      .notNull()
      .default('manual'),
    grantedBy: integer('granted_by').references(() => users.id, { onDelete: 'set null' }),
    grantedAt: integer('granted_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index('user_roles_role_idx').on(t.roleId)],
);

/**
 * Which roles a rank confers. Assigning a member to a rank grants these roles
 * (source='rank'), and a rank change reconciles them. Many-to-many: a rank can
 * grant several roles, and a role can be granted by several ranks.
 */
export const rankRoles = sqliteTable(
  'rank_roles',
  {
    rankId: integer('rank_id')
      .notNull()
      .references(() => ranks.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.rankId, t.roleId] }), index('rank_roles_role_idx').on(t.roleId)],
);

/* ------------------------------------------------------------------ *
 * Sessions — opaque random id in an httpOnly cookie, state kept here.
 * ------------------------------------------------------------------ */

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(), // 256-bit random, base64url
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

/* ------------------------------------------------------------------ *
 * Content
 * ------------------------------------------------------------------ */

export const news = sqliteTable(
  'news',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    excerpt: text('excerpt'),
    // HTML from the WYSIWYG editor (TipTap). Sanitized on save and again with
    // DOMPurify on render, so stored markup is never trusted at display time.
    body: text('body').notNull(),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['draft', 'published', 'archived'] })
      .notNull()
      .default('draft'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    publishedAt: integer('published_at'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [index('news_status_published_idx').on(t.status, t.publishedAt)],
);

/**
 * Replaces the original site_info + site_prefs + templates + header tables.
 * Theme tokens live under the 'theme' key as CSS custom properties, e.g.
 * { "--color-accent": "#c0392b", "--font-body": "Inter" }
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
});

/* ------------------------------------------------------------------ *
 * Competition
 * ------------------------------------------------------------------ */

export const games = sqliteTable('games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  iconUrl: text('icon_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull().default(now),
});

export const medals = sqliteTable(
  'medals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    // NULL = clan-wide medal. Set = specific to one game (was the game_medals table).
    gameId: integer('game_id').references(() => games.id, { onDelete: 'cascade' }),
    // Tenure medals: when set, this medal is granted automatically once a member
    // reaches this many months in the guild (6, 12, 24, …). NULL = awarded by
    // hand only. The auto-grant sweep lives in server/medals/tenure.ts.
    autoGrantMonths: integer('auto_grant_months'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('medals_game_idx').on(t.gameId)],
);

export const memberMedals = sqliteTable(
  'member_medals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    medalId: integer('medal_id')
      .notNull()
      .references(() => medals.id, { onDelete: 'cascade' }),
    citation: text('citation'), // why it was awarded
    awardedBy: integer('awarded_by').references(() => users.id, { onDelete: 'set null' }),
    awardedAt: integer('awarded_at').notNull().default(now),
  },
  (t) => [
    index('member_medals_user_idx').on(t.userId),
    index('member_medals_medal_idx').on(t.medalId),
  ],
);

/* ------------------------------------------------------------------ *
 * War records — awardable "items of pride", handed to members like medals
 * but themed as clan-war honours. A definition (optionally tied to a game)
 * plus a join table of who holds it. Distinct from `matches` below, which is
 * the (currently unused) detailed battle-log design.
 * ------------------------------------------------------------------ */

export const warRecords = sqliteTable(
  'war_records',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    // NULL = clan-wide. Set = specific to one game.
    gameId: integer('game_id').references(() => games.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('war_records_game_idx').on(t.gameId)],
);

export const memberWarRecords = sqliteTable(
  'member_war_records',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    warRecordId: integer('war_record_id')
      .notNull()
      .references(() => warRecords.id, { onDelete: 'cascade' }),
    citation: text('citation'),
    awardedBy: integer('awarded_by').references(() => users.id, { onDelete: 'set null' }),
    awardedAt: integer('awarded_at').notNull().default(now),
  },
  (t) => [
    index('member_war_records_user_idx').on(t.userId),
    index('member_war_records_record_idx').on(t.warRecordId),
  ],
);

/** Replaces the original records + stat_records tables. */
export const matches = sqliteTable(
  'matches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    opponent: text('opponent').notNull(),
    opponentTag: text('opponent_tag'),
    result: text('result', { enum: ['win', 'loss', 'draw', 'forfeit'] }).notNull(),
    scoreUs: integer('score_us'),
    scoreThem: integer('score_them'),
    map: text('map'),
    notes: text('notes'),
    playedAt: integer('played_at').notNull(),
    recordedBy: integer('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('matches_game_played_idx').on(t.gameId, t.playedAt)],
);

export const matchParticipants = sqliteTable(
  'match_participants',
  {
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Per-game shape varies, so keep it open: { "kills": 12, "deaths": 4 }
    stats: text('stats', { mode: 'json' }).$type<Record<string, number>>(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] }), index('mp_user_idx').on(t.userId)],
);

/* ------------------------------------------------------------------ *
 * Events — clan happenings (war nights, tournaments, movie nights).
 * Authorised members create them; the bot mirrors each to a native Discord
 * scheduled event AND an announcement message, tracked by the id columns so
 * edits and cancellations stay in sync. Times are unix seconds (UTC).
 * ------------------------------------------------------------------ */

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    startsAt: integer('starts_at').notNull(),
    // Discord's external scheduled events require an end time and a location.
    endsAt: integer('ends_at').notNull(),
    location: text('location').notNull(),
    gameId: integer('game_id').references(() => games.id, { onDelete: 'set null' }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    // The native Discord scheduled event and the channel announcement message,
    // so an edit/cancel here can update or remove them.
    discordEventId: text('discord_event_id'),
    discordMessageId: text('discord_message_id'),
    status: text('status', { enum: ['scheduled', 'cancelled'] })
      .notNull()
      .default('scheduled'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [index('events_starts_idx').on(t.startsAt)],
);

/* ------------------------------------------------------------------ *
 * Audit — replaces the original log + security tables.
 * ------------------------------------------------------------------ */

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // e.g. 'member.promote', 'role.grant'
    targetType: text('target_type'),
    targetId: text('target_id'),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
    // 'web' for admin portal, 'discord' for slash commands
    source: text('source', { enum: ['web', 'discord', 'system'] })
      .notNull()
      .default('web'),
    ip: text('ip'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('audit_actor_idx').on(t.actorId),
    index('audit_created_idx').on(t.createdAt),
    index('audit_action_idx').on(t.action),
  ],
);
