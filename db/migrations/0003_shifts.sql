CREATE TABLE `player_games` (
	`game_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`season` integer NOT NULL,
	`game_type` integer NOT NULL,
	`pos` text NOT NULL,
	`toi` integer NOT NULL,
	`toi5` integer NOT NULL,
	`cf` integer NOT NULL,
	`ca` integer NOT NULL,
	`gf` integer NOT NULL,
	`ga` integer NOT NULL,
	`xgf` real NOT NULL,
	`xga` real NOT NULL,
	`goals` integer NOT NULL,
	`a1` integer NOT NULL,
	`a2` integer NOT NULL,
	`sog` integer NOT NULL,
	`blk` integer NOT NULL,
	`pd` integer NOT NULL,
	`pt` integer NOT NULL,
	`fow` integer NOT NULL,
	`fol` integer NOT NULL,
	`gsax` real,
	`game_score` real NOT NULL,
	PRIMARY KEY(`game_id`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `player_games_player` ON `player_games` (`player_id`,`season`);--> statement-breakpoint
CREATE INDEX `player_games_season` ON `player_games` (`season`,`game_type`);--> statement-breakpoint
CREATE TABLE `shift_status` (
	`game_id` integer PRIMARY KEY NOT NULL,
	`status` integer NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unit_games` (
	`game_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`season` integer NOT NULL,
	`game_type` integer NOT NULL,
	`kind` text NOT NULL,
	`players` text NOT NULL,
	`toi5` integer NOT NULL,
	`cf` integer NOT NULL,
	`ca` integer NOT NULL,
	`gf` integer NOT NULL,
	`ga` integer NOT NULL,
	`xgf` real NOT NULL,
	`xga` real NOT NULL,
	PRIMARY KEY(`game_id`, `team_id`, `players`)
);
--> statement-breakpoint
CREATE INDEX `unit_games_team` ON `unit_games` (`team_id`,`season`);