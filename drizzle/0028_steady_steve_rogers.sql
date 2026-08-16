CREATE TABLE `tournament_entrants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`user_id` integer,
	`name` text,
	`seed` integer,
	`checked_in` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'registered' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tournament_entrants_tournament_idx` ON `tournament_entrants` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_entrants_tournament_user_idx` ON `tournament_entrants` (`tournament_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `tournament_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`bracket` text DEFAULT 'winners' NOT NULL,
	`round` integer NOT NULL,
	`slot` integer NOT NULL,
	`entrant1_id` integer,
	`entrant2_id` integer,
	`winner_id` integer,
	`score1` integer DEFAULT 0 NOT NULL,
	`score2` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`winner_next_match_id` integer,
	`winner_next_slot` integer,
	`loser_next_match_id` integer,
	`loser_next_slot` integer,
	`reported_by` integer,
	`reported_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entrant1_id`) REFERENCES `tournament_entrants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entrant2_id`) REFERENCES `tournament_entrants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`winner_id`) REFERENCES `tournament_entrants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reported_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tournament_matches_tournament_idx` ON `tournament_matches` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournament_matches_round_idx` ON `tournament_matches` (`tournament_id`,`bracket`,`round`);--> statement-breakpoint
CREATE TABLE `tournament_team_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entrant_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`is_captain` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`entrant_id`) REFERENCES `tournament_entrants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tournament_team_members_entrant_idx` ON `tournament_team_members` (`entrant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_team_members_entrant_user_idx` ON `tournament_team_members` (`entrant_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`image_url` text,
	`game_id` integer,
	`format` text DEFAULT 'single_elim' NOT NULL,
	`competitor_type` text DEFAULT 'individual' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`max_entrants` integer,
	`seed_method` text DEFAULT 'random' NOT NULL,
	`best_of` integer DEFAULT 1 NOT NULL,
	`third_place` integer DEFAULT false NOT NULL,
	`swiss_rounds` integer DEFAULT 5 NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`starts_at` integer,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_slug_unique` ON `tournaments` (`slug`);--> statement-breakpoint
CREATE INDEX `tournaments_status_idx` ON `tournaments` (`status`);