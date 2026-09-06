CREATE TABLE `boards` (
	`tag_id` text PRIMARY KEY NOT NULL,
	`tag_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`theme_color` text DEFAULT '#888888' NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `configs` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `draw_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`drawn_at` integer NOT NULL,
	`pool_id` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`draw_type` text NOT NULL,
	`stock_code` text NOT NULL,
	`direction` text NOT NULL,
	`rolled_rarity` text NOT NULL,
	`final_rarity` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pool_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_date` text NOT NULL,
	`pool_id` text NOT NULL,
	`stock_count` integer DEFAULT 0 NOT NULL,
	`up_stock_count` integer DEFAULT 0 NOT NULL,
	`down_stock_count` integer DEFAULT 0 NOT NULL,
	`board_1d_strength` real,
	`board_30d_strength` real,
	`is_open` integer DEFAULT false NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`pool_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pool_snapshots_bk` ON `pool_snapshots` (`snapshot_date`,`pool_id`);--> statement-breakpoint
CREATE TABLE `pools` (
	`pool_id` text PRIMARY KEY NOT NULL,
	`pool_code` text NOT NULL,
	`pool_name` text NOT NULL,
	`pool_type` text NOT NULL,
	`related_tag_id` text,
	`active` integer DEFAULT false NOT NULL,
	`min_stock_count` integer DEFAULT 30 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`related_tag_id`) REFERENCES `boards`(`tag_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `snapshot_stocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_date` text NOT NULL,
	`pool_id` text NOT NULL,
	`stock_code` text NOT NULL,
	`direction` text NOT NULL,
	`rarity` text NOT NULL,
	`change_30d` real NOT NULL,
	`change_1d` real,
	`close` real NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`drawable` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshot_stocks_bk` ON `snapshot_stocks` (`snapshot_date`,`pool_id`,`stock_code`);--> statement-breakpoint
CREATE INDEX `snapshot_stocks_pool_idx` ON `snapshot_stocks` (`snapshot_date`,`pool_id`,`direction`,`rarity`);--> statement-breakpoint
CREATE TABLE `stock_boards` (
	`stock_code` text NOT NULL,
	`tag_id` text NOT NULL,
	`is_primary` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`stock_code`) REFERENCES `stocks`(`stock_code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `boards`(`tag_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_boards_pk` ON `stock_boards` (`stock_code`,`tag_id`);--> statement-breakpoint
CREATE INDEX `stock_boards_tag_idx` ON `stock_boards` (`tag_id`);--> statement-breakpoint
CREATE TABLE `stock_prices` (
	`stock_code` text NOT NULL,
	`date` text NOT NULL,
	`close` real NOT NULL,
	`change1d` real,
	`volume` real,
	FOREIGN KEY (`stock_code`) REFERENCES `stocks`(`stock_code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_prices_pk` ON `stock_prices` (`stock_code`,`date`);--> statement-breakpoint
CREATE INDEX `stock_prices_date_idx` ON `stock_prices` (`date`);--> statement-breakpoint
CREATE TABLE `stocks` (
	`stock_code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`market` text NOT NULL,
	`board_code` text,
	`listed_date` text,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`board_code`) REFERENCES `boards`(`tag_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stocks_board_idx` ON `stocks` (`board_code`,`active`);