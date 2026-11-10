ALTER TABLE `messages` ADD `reply_to_id` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `mentions` text DEFAULT '[]' NOT NULL;