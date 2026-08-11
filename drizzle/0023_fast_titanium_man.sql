CREATE TABLE `gallery_albums` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`audience` text DEFAULT 'members' NOT NULL,
	`visible_to_role` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`visible_to_role`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_albums_slug_unique` ON `gallery_albums` (`slug`);--> statement-breakpoint
CREATE INDEX `gallery_album_sort_idx` ON `gallery_albums` (`sort_order`);--> statement-breakpoint
CREATE TABLE `gallery_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`src` text,
	`provider` text,
	`thumb_url` text,
	`width` integer DEFAULT 1600 NOT NULL,
	`height` integer DEFAULT 1200 NOT NULL,
	`caption` text,
	`alt` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `gallery_albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `gallery_item_album_idx` ON `gallery_items` (`album_id`,`sort_order`);