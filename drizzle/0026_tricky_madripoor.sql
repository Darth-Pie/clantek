ALTER TABLE `notifications` ADD `reviewed_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `notifications` ADD `reviewed_at` integer;