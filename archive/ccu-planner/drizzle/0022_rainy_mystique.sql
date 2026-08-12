CREATE TABLE `sc_ccu_boards` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`board` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
