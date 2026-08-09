-- mustr fresh-install seed — reference data for a brand-new instance.
--
-- This is seed.sql WITHOUT the hardcoded founder/god account: on a productized
-- install the first owner is minted by the setup wizard's Discord OAuth claim
-- (see src/server/setup/*), never baked into SQL. Everything here is idempotent.
--
-- Statements are separated by `--> statement-breakpoint` (the same convention as
-- the drizzle migrations) so scripts/bundle-migrations.mjs can split it into
-- individual statements for the in-Worker initializer.

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
--> statement-breakpoint
INSERT OR IGNORE INTO roles (id, name, description, color, sort_order, is_system) VALUES
  (1, 'Command',    'Full administrative control of the site',        '#c0392b', 100, 1),
  (2, 'Officer',    'Manage the roster, awards, and match records',   '#e67e22', 80,  1),
  (3, 'Editor',     'Write and publish news',                         '#2980b9', 60,  0),
  (4, 'Recorder',   'Record match results',                           '#27ae60', 40,  0),
  (5, 'Member',     'Verified member of the clan',                    '#7f8c8d', 0,   1);
--> statement-breakpoint
INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES
  (1, 'roster.view'), (1, 'roster.edit'), (1, 'roster.promote'), (1, 'roster.remove'),
  (1, 'roles.assign'), (1, 'roles.manage'), (1, 'ranks.manage'),
  (1, 'news.create'), (1, 'news.publish'), (1, 'news.delete'),
  (1, 'medals.award'), (1, 'medals.manage'),
  (1, 'games.manage'), (1, 'matches.record'), (1, 'matches.manage'),
  (1, 'warrecords.manage'), (1, 'warrecords.award'),
  (1, 'events.view'), (1, 'events.manage'), (1, 'events.attendees'),
  (1, 'theme.manage'), (1, 'pages.manage'), (1, 'settings.manage'),
  (1, 'audit.view'), (1, 'discord.sync'),
  (2, 'roster.view'), (2, 'roster.edit'), (2, 'roster.promote'),
  (2, 'roles.assign'),
  (2, 'news.create'), (2, 'news.publish'),
  (2, 'medals.award'), (2, 'warrecords.award'),
  (2, 'games.manage'), (2, 'matches.record'), (2, 'matches.manage'),
  (2, 'events.view'), (2, 'events.manage'), (2, 'events.attendees'),
  (2, 'audit.view'),
  (3, 'roster.view'), (3, 'news.create'), (3, 'news.publish'), (3, 'events.view'),
  (4, 'roster.view'), (4, 'matches.record'), (4, 'events.view'),
  (5, 'roster.view'), (5, 'events.view');
--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site', json('{"name":"mustr","tagline":"","description":"","copyright":""}')),
  ('theme', json('{"--color-bg": "#0f1115", "--color-surface": "#171a21", "--color-border": "#262b36", "--color-text": "#e6e8ec", "--color-muted": "#9aa3b2", "--color-accent": "#c0392b", "--color-accent-text": "#ffffff", "--font-body": "system-ui, sans-serif", "--font-display": "system-ui, sans-serif", "--radius": "8px"}'));
