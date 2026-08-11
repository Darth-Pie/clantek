import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { HangarItem } from '../shared/hangar';
import type { CcuBoard } from '../shared/ccu';

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

    // 'pending' = applied via Discord login but not yet a full member (may not be
    // in the guild yet). A pending user is authenticated but authorized like a
    // logged-out visitor (except editing their own profile) — see buildViewer.
    status: text('status', { enum: ['pending', 'active', 'inactive', 'loa', 'retired', 'banned'] })
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

/**
 * The ban list — keyed by Discord id so a ban survives deleting the member's
 * record (that's the whole point: it must block re-login even with no user row).
 * Checked at the very top of the OAuth callback, before anything is created.
 * `username` is a display snapshot; removing the row un-bans the Discord id.
 */
export const bans = sqliteTable('bans', {
  discordId: text('discord_id').primaryKey(),
  username: text('username'),
  reason: text('reason'),
  bannedBy: integer('banned_by').references(() => users.id, { onDelete: 'set null' }),
  bannedAt: integer('banned_at').notNull().default(now),
});

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

/**
 * A member's imported Star Citizen hangar (the SC module) — one JSON blob per
 * member, the normalised item list from the scraper. Replaced wholesale on each
 * re-import; cascades away with the member. Only used when the Star Citizen
 * module is enabled in settings.
 */
export const scHangars = sqliteTable('sc_hangars', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  items: text('items', { mode: 'json' }).$type<HangarItem[]>().notNull(),
  itemCount: integer('item_count').notNull().default(0),
  // Whether the owner has chosen to share this hangar with members who hold the
  // hangar.view permission. Off by default — sharing is opt-in per member.
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  importedAt: integer('imported_at').notNull().default(now),
});

/**
 * A member's CCU (Cross Chassis Upgrade) planning board — one JSON blob per
 * member, chains of upgrade steps built on top of their imported hangar. Steps
 * are either references into that hangar or upgrades the member has yet to buy,
 * so a board is a plan, not a record of ownership. Shares the hangar's opt-in
 * visibility model; cascades away with the member. SC module only.
 */
export const scCcuBoards = sqliteTable('sc_ccu_boards', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  board: text('board', { mode: 'json' }).$type<CcuBoard>().notNull(),
  // Whether the owner has shared their plans with members holding hangar.view.
  // Off by default, exactly like the hangar — sharing is opt-in per member.
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull().default(now),
});

/**
 * RSI account verification (the SC module's anti-poser track). A member proves
 * control of an RSI account by placing a one-time code in their public citizen
 * bio; the Worker fetches the profile, confirms the code, and records the parsed
 * org membership. `rsiHandle` is unique so two members can't claim one account
 * (multiple NULLs are allowed for the unverified). The pending_* columns hold an
 * in-flight challenge before it's confirmed. Cascades away with the member.
 */
export const scVerifications = sqliteTable('sc_verifications', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // In-flight challenge: the code the member must place in their RSI bio and the
  // handle they claimed. Cleared once verified (or replaced on a new attempt).
  pendingCode: text('pending_code'),
  pendingHandle: text('pending_handle'),
  pendingAt: integer('pending_at'),
  // Last time we fetched RSI for this member — a light rate-limit so the confirm
  // button can't hammer RSI (politeness, set before each fetch).
  lastCheckAt: integer('last_check_at'),
  // The verified result — NULL until a confirm succeeds.
  rsiHandle: text('rsi_handle').unique(),
  verifiedAt: integer('verified_at'),
  orgSid: text('org_sid'),
  orgRank: text('org_rank'),
  // Whether the profile's org block was public (vs redacted), and whether the
  // parsed org SID matched this install's configured org.
  orgVisible: integer('org_visible', { mode: 'boolean' }),
  inOrg: integer('in_org', { mode: 'boolean' }),
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
 * API tokens — long-lived personal access tokens for the mobile/native app and
 * scripts. Like sessions, only the SHA-256 of the token is stored, so a database
 * dump can't be replayed. Unlike sessions they carry a user-chosen label and a
 * short display prefix, are managed from account settings, and resolve to the
 * same Viewer (rank + union of role permissions) as a web session.
 * ------------------------------------------------------------------ */

export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(), // SHA-256 (base64url) of the raw token
    label: text('label').notNull(),
    prefix: text('prefix').notNull(), // e.g. "clt_ab12cd" — shown so a token is identifiable
    expiresAt: integer('expires_at'), // null = no expiry
    lastUsedAt: integer('last_used_at'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('api_tokens_user_idx').on(t.userId)],
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
/* ------------------------------------------------------------------ *
 * Training — a repository of courses (embedded Google Slides today) that can be
 * required for specific ranks and marked complete per member. Completion is
 * private (visible to the member + holders of training.view).
 * ------------------------------------------------------------------ */

/** Collapsible sections/categories a course can be grouped under in the module. */
export const trainingSections = sqliteTable('training_sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
});

export const trainings = sqliteTable('trainings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  // Optional grouping; NULL = ungrouped. Deleting a section un-groups its courses
  // (set null), it never deletes them.
  sectionId: integer('section_id').references(() => trainingSections.id, { onDelete: 'set null' }),
  // The pasted source URL (kept for editing) and the canonical, origin-locked
  // embed src derived from it (what actually goes in the iframe). See
  // shared/trainingEmbed.ts — the src is never the raw pasted value.
  embedUrl: text('embed_url').notNull(),
  embedSrc: text('embed_src').notNull(),
  provider: text('provider'),
  // How a member gets marked done: 'self' = they can tick it off themselves;
  // 'officer' = only a training.manage holder can (verified). Chosen per course.
  completionMode: text('completion_mode', { enum: ['self', 'officer'] }).notNull().default('officer'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
});

/** Which ranks a training is required for (many-to-many). No rows = not required. */
export const trainingRequiredRanks = sqliteTable(
  'training_required_ranks',
  {
    trainingId: integer('training_id')
      .notNull()
      .references(() => trainings.id, { onDelete: 'cascade' }),
    rankId: integer('rank_id')
      .notNull()
      .references(() => ranks.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.trainingId, t.rankId] })],
);

/** One row per member per training they've completed. markedBy = who checked it (self or an officer). */
export const trainingCompletions = sqliteTable(
  'training_completions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    trainingId: integer('training_id')
      .notNull()
      .references(() => trainings.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    completedAt: integer('completed_at').notNull().default(now),
    markedBy: integer('marked_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('training_completion_unique').on(t.trainingId, t.userId)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
});

/**
 * Drag-and-drop page layouts. Each standard page (home, etc.) is one row keyed
 * by a stable `slug`; `layout` is the JSON module tree (rows → columns →
 * modules) defined in src/shared/layout.ts. Any client — the web app today, a
 * native app later — renders the same data, so the layout is deliberately kept
 * as portable JSON rather than baked into components. A missing row falls back
 * to the built-in DEFAULT_LAYOUTS for that slug.
 */
export const pageLayouts = sqliteTable('page_layouts', {
  slug: text('slug').primaryKey(),
  // Human title, shown in the admin page list and used as the nav label.
  title: text('title'),
  layout: text('layout', { mode: 'json' }).$type<unknown>().notNull(),
  // Custom pages can be surfaced in the top nav. 'home' is navigated to at / and
  // is never listed here. nav_order sorts the extra links.
  showInNav: integer('show_in_nav', { mode: 'boolean' }).notNull().default(false),
  navOrder: integer('nav_order').notNull().default(0),
  // Whether logged-out visitors may view this page at all. Off by default so a
  // page never leaks by accident; the home page is seeded on (migration 0018) so
  // a fresh install has a public landing page. Even on a public page, module-level
  // visibility still applies — only modules marked "public" show to anonymous.
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
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
    // An optional banner image (an R2 /media/events/… URL), shown on the events
    // page and as the Discord announcement embed image.
    imageUrl: text('image_url'),
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
    // How often this event repeats. The event itself is the first occurrence;
    // when it ends the cron spawns the next one and clears this back to 'none'
    // on the finished row (the recurrence "baton" moves to the new occurrence).
    // So at most one future occurrence per series carries a non-'none' value.
    recurrence: text('recurrence', { enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly'] })
      .notNull()
      .default('none'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [index('events_starts_idx').on(t.startsAt)],
);

/**
 * The sign-up "roles" for an event — e.g. Tank / Healer / DPS. Defined per
 * event when it's created. A member picks at most one; an optional capacity
 * caps how many can hold it. Deleting a role frees its holders back to
 * "attending, no role" (the signup's eventRoleId is set null).
 */
export const eventRoles = sqliteTable(
  'event_roles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Optional emoji shown on the Discord sign-up button (a unicode char).
    emoji: text('emoji'),
    // NULL = unlimited. Otherwise the max number of members who can hold it.
    capacity: integer('capacity'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('event_roles_event_idx').on(t.eventId)],
);

/**
 * A member's sign-up for an event. One row per member per event (unique), so
 * choosing a different role updates the same row and withdrawing deletes it.
 * eventRoleId NULL means "attending, no specific role". Written from both the
 * website and Discord button clicks — the two stay in sync because they share
 * this table.
 */
export const eventSignups = sqliteTable(
  'event_signups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventRoleId: integer('event_role_id').references(() => eventRoles.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('event_signups_event_user_idx').on(t.eventId, t.userId),
    index('event_signups_event_idx').on(t.eventId),
  ],
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
    // A human-written justification. Required for negative actions (demote,
    // remove/ban, revoke a medal/war record/role); optional otherwise. Kept as
    // its own column — not buried in meta — so the log can show and filter on it.
    reason: text('reason'),
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
