CREATE TABLE `shots` (
	`game_id` integer NOT NULL,
	`event_id` integer NOT NULL,
	`season` integer NOT NULL,
	`game_type` integer NOT NULL,
	`period` integer NOT NULL,
	`game_seconds` integer NOT NULL,
	`team_id` integer NOT NULL,
	`opp_team_id` integer NOT NULL,
	`is_home` integer NOT NULL,
	`shooter_id` integer,
	`goalie_id` integer,
	`type` text NOT NULL,
	`shot_type` text,
	`x` real,
	`y` real,
	`distance` real,
	`angle` real,
	`own_skaters` integer NOT NULL,
	`opp_skaters` integer NOT NULL,
	`strength` text NOT NULL,
	`rebound` integer NOT NULL,
	`rush` integer NOT NULL,
	`high_danger` integer NOT NULL,
	`last_event` text NOT NULL,
	`seconds_since_last` integer NOT NULL,
	`is_goal` integer NOT NULL,
	`xg` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`game_id`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `shots_team_season` ON `shots` (`team_id`,`season`);--> statement-breakpoint
CREATE INDEX `shots_goalie` ON `shots` (`goalie_id`,`season`);--> statement-breakpoint
CREATE TABLE `stats_games` (
	`id` integer PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`game_type` integer NOT NULL,
	`game_date` text NOT NULL,
	`home_id` integer NOT NULL,
	`away_id` integer NOT NULL,
	`home_abbrev` text NOT NULL,
	`away_abbrev` text NOT NULL,
	`home_score` integer NOT NULL,
	`away_score` integer NOT NULL,
	`last_period_type` text NOT NULL,
	`ingested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stats_games_season` ON `stats_games` (`season`,`game_type`);--> statement-breakpoint
CREATE TABLE `strength_time` (
	`game_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`strength` text NOT NULL,
	`seconds` integer NOT NULL,
	PRIMARY KEY(`game_id`, `team_id`, `strength`)
);
