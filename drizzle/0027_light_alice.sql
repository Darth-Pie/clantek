CREATE TABLE `event_attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`source` text DEFAULT 'self' NOT NULL,
	`marked_by` integer,
	`checked_in_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_attendance_event_user_idx` ON `event_attendance` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `event_attendance_user_idx` ON `event_attendance` (`user_id`);--> statement-breakpoint
CREATE TABLE `member_activity` (
	`user_id` integer NOT NULL,
	`day` integer NOT NULL,
	`source` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `day`, `source`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_activity_user_idx` ON `member_activity` (`user_id`);--> statement-breakpoint
ALTER TABLE `medals` ADD `auto_grant_attendance` integer;