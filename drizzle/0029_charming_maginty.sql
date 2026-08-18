CREATE TABLE `alliance_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`outbound_token` text,
	`inbound_token_hash` text,
	`inbound_token_prefix` text,
	`channel_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`last_inbound_at` integer,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alliance_links_inbound_token_hash_unique` ON `alliance_links` (`inbound_token_hash`);--> statement-breakpoint
CREATE INDEX `alliance_links_enabled_idx` ON `alliance_links` (`enabled`);