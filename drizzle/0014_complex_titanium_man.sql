CREATE TABLE `sc_hangars` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`items` text NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`imported_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
