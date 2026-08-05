CREATE TABLE `page_layouts` (
	`slug` text PRIMARY KEY NOT NULL,
	`title` text,
	`layout` text NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
