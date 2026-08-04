CREATE TABLE `member_war_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`war_record_id` integer NOT NULL,
	`citation` text,
	`awarded_by` integer,
	`awarded_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`war_record_id`) REFERENCES `war_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`awarded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `member_war_records_user_idx` ON `member_war_records` (`user_id`);--> statement-breakpoint
CREATE INDEX `member_war_records_record_idx` ON `member_war_records` (`war_record_id`);--> statement-breakpoint
CREATE TABLE `war_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`image_url` text,
	`game_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `war_records_game_idx` ON `war_records` (`game_id`);