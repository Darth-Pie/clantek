CREATE TABLE `rank_roles` (
	`rank_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	PRIMARY KEY(`rank_id`, `role_id`),
	FOREIGN KEY (`rank_id`) REFERENCES `ranks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rank_roles_role_idx` ON `rank_roles` (`role_id`);--> statement-breakpoint
ALTER TABLE `user_roles` ADD `source` text DEFAULT 'manual' NOT NULL;