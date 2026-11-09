CREATE TABLE `event_rsvps` (
	`event_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`status` text NOT NULL,
	`people_count` integer DEFAULT 1 NOT NULL,
	`note` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `guest_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`date` text NOT NULL,
	`time` text,
	`place_label` text,
	`place_lat` real,
	`place_lng` real,
	`is_official` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_date_idx` ON `events` (`date`);