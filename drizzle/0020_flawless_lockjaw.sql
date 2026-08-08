CREATE TABLE `training_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`training_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`completed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`marked_by` integer,
	FOREIGN KEY (`training_id`) REFERENCES `trainings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_completion_unique` ON `training_completions` (`training_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `training_required_ranks` (
	`training_id` integer NOT NULL,
	`rank_id` integer NOT NULL,
	PRIMARY KEY(`training_id`, `rank_id`),
	FOREIGN KEY (`training_id`) REFERENCES `trainings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rank_id`) REFERENCES `ranks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trainings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`embed_url` text NOT NULL,
	`embed_src` text NOT NULL,
	`provider` text,
	`completion_mode` text DEFAULT 'officer' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
