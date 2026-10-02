CREATE TABLE `goal_status` (
	`game_id` integer PRIMARY KEY NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`game_id` integer NOT NULL,
	`event_id` integer NOT NULL,
	`season` integer NOT NULL,
	`game_type` integer NOT NULL,
	`period` integer NOT NULL,
	`period_type` text NOT NULL,
	`period_seconds` integer NOT NULL,
	`team_id` integer NOT NULL,
	`opp_team_id` integer NOT NULL,
	`scorer_id` integer,
	`a1_id` integer,
	`a2_id` integer,
	`own_before` integer NOT NULL,
	`opp_before` integer NOT NULL,
	`own_goalie_in` integer NOT NULL,
	`opp_goalie_in` integer NOT NULL,
	PRIMARY KEY(`game_id`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `goals_season` ON `goals` (`season`);--> statement-breakpoint
CREATE TABLE `player_names` (
	`player_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pos` text NOT NULL,
	`team_id` integer NOT NULL,
	`last_game_date` text NOT NULL
);
