ALTER TABLE `page_layouts` ADD `is_public` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- The home page is the public landing page: mark any existing 'home' row public
-- so upgrading installs keep a reachable front page. Fresh installs with no home
-- row default to public in code (see routes/pages.ts). Custom pages stay private.
UPDATE `page_layouts` SET `is_public` = 1 WHERE `slug` = 'home';