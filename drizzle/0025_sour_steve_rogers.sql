CREATE TABLE `site_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`r2_key` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`table_counts` text DEFAULT '{}' NOT NULL,
	`kind` text DEFAULT 'manual' NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `site_snapshots_created_idx` ON `site_snapshots` (`created_at`);