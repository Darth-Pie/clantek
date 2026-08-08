CREATE TABLE `bans` (
	`discord_id` text PRIMARY KEY NOT NULL,
	`username` text,
	`reason` text,
	`banned_by` integer,
	`banned_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`banned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
