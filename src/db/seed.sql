-- ClanTek initial data.
-- Safe to re-run: every statement is INSERT OR IGNORE / idempotent.
--
--   npm run db:seed:local     (local dev)
--   npm run db:seed:remote    (production)

/* ------------------------------------------------------------------ *
 * Ranks — ten to start. Add, rename, reorder, or delete any of these
 * from the admin portal; nothing in the code depends on these names.
 * sort_order 0 is the lowest rung.
 * ------------------------------------------------------------------ */

INSERT OR IGNORE INTO ranks (id, name, abbreviation, sort_order, req_days, req_wins, is_default) VALUES
  (1,  'Recruit',        'RCT', 0, 0,   0,  1),
  (2,  'Private',        'PVT', 1, 14,  0,  0),
  (3,  'Corporal',       'CPL', 2, 30,  5,  0),
  (4,  'Sergeant',       'SGT', 3, 60,  15, 0),
  (5,  'Staff Sergeant', 'SSG', 4, 90,  30, 0),
  (6,  'Lieutenant',     'LT',  5, 120, 50, 0),
  (7,  'Captain',        'CPT', 6, 180, 75, 0),
  (8,  'Major',          'MAJ', 7, 240, 100,0),
  (9,  'Colonel',        'COL', 8, 300, 125,0),
  (10, 'General',        'GEN', 9, 365, 150,0);

/* ------------------------------------------------------------------ *
 * Roles — capability bundles, independent of the rank ladder.
 * Map each to a Discord role id from the admin portal to have membership
 * changes here push into Discord.
 * ------------------------------------------------------------------ */

INSERT OR IGNORE INTO roles (id, name, description, color, sort_order, is_system) VALUES
  (1, 'Command',    'Full administrative control of the site',        '#c0392b', 100, 1),
  (2, 'Officer',    'Manage the roster, awards, and match records',   '#e67e22', 80,  1),
  (3, 'Editor',     'Write and publish news',                         '#2980b9', 60,  0),
  (4, 'Recorder',   'Record match results',                           '#27ae60', 40,  0),
  (5, 'Member',     'Verified member of the clan',                    '#7f8c8d', 0,   1);

INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES
  -- Command
  (1, 'roster.view'), (1, 'roster.edit'), (1, 'roster.promote'), (1, 'roster.remove'),
  (1, 'roles.assign'), (1, 'roles.manage'), (1, 'ranks.manage'),
  (1, 'news.create'), (1, 'news.publish'), (1, 'news.delete'),
  (1, 'medals.award'), (1, 'medals.manage'),
  (1, 'games.manage'), (1, 'matches.record'), (1, 'matches.manage'),
  (1, 'warrecords.manage'), (1, 'warrecords.award'),
  (1, 'events.view'), (1, 'events.manage'),
  (1, 'theme.manage'), (1, 'settings.manage'),
  (1, 'audit.view'), (1, 'discord.sync'),
  -- Officer
  (2, 'roster.view'), (2, 'roster.edit'), (2, 'roster.promote'),
  (2, 'roles.assign'),
  (2, 'news.create'), (2, 'news.publish'),
  (2, 'medals.award'), (2, 'warrecords.award'),
  (2, 'games.manage'), (2, 'matches.record'), (2, 'matches.manage'),
  (2, 'events.view'), (2, 'events.manage'),
  (2, 'audit.view'),
  -- Editor
  (3, 'roster.view'), (3, 'news.create'), (3, 'news.publish'), (3, 'events.view'),
  -- Recorder
  (4, 'roster.view'), (4, 'matches.record'), (4, 'events.view'),
  -- Member
  (5, 'roster.view'), (5, 'events.view');

/* ------------------------------------------------------------------ *
 * Founder account.
 *
 * Seeded ahead of first login so there is never a bootstrap window where
 * nobody can administer the site. The username and avatar below are
 * placeholders — they are overwritten with real Discord data the first
 * time this account signs in.
 *
 * is_god = 1 bypasses every permission check and is not assignable from
 * the UI. To hand it to someone else, change it here and re-run.
 * ------------------------------------------------------------------ */

INSERT OR IGNORE INTO users (discord_id, username, global_name, rank_id, is_god, status)
VALUES ('161833822307090432', 'founder', 'Founder', 10, 1, 'active');

INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT id, 1 FROM users WHERE discord_id = '161833822307090432';

/* ------------------------------------------------------------------ *
 * Site settings. Theme values are CSS custom properties applied at the
 * document root — the modern replacement for the old templates/header
 * tables full of <font> attributes and IE scrollbar colors.
 * ------------------------------------------------------------------ */

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site', json('{"name":"ClanTek","tagline":"","description":"","copyright":""}')),
  ('theme', json('{
    "--color-bg": "#0f1115",
    "--color-surface": "#171a21",
    "--color-border": "#262b36",
    "--color-text": "#e6e8ec",
    "--color-muted": "#9aa3b2",
    "--color-accent": "#c0392b",
    "--color-accent-text": "#ffffff",
    "--font-body": "system-ui, sans-serif",
    "--font-display": "system-ui, sans-serif",
    "--radius": "8px"
  }'));
