CREATE TABLE `sc_verifications` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`pending_code` text,
	`pending_handle` text,
	`pending_at` integer,
	`rsi_handle` text,
	`verified_at` integer,
	`org_sid` text,
	`org_rank` text,
	`org_visible` integer,
	`in_org` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sc_verifications_rsi_handle_unique` ON `sc_verifications` (`rsi_handle`);