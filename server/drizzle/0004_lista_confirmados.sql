ALTER TABLE `guests` ADD `cpf` text;--> statement-breakpoint
ALTER TABLE `guests` ADD `companion_cpfs` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `guests` ADD `import_key` text;--> statement-breakpoint
ALTER TABLE `guests` ADD `invite_label` text;--> statement-breakpoint
ALTER TABLE `guests` ADD `claimed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `guests_import_key_unique` ON `guests` (`import_key`);--> statement-breakpoint
UPDATE `guests` SET `claimed_at` = `created_at` WHERE `claimed_at` IS NULL;
