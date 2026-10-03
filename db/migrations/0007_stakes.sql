CREATE TABLE `stakes` (
	`run_at` integer NOT NULL,
	`season` integer NOT NULL,
	`game_id` integer NOT NULL,
	`team` text NOT NULL,
	`odds_now` real NOT NULL,
	`if_win` real NOT NULL,
	`if_ot_loss` real NOT NULL,
	`if_loss` real NOT NULL,
	PRIMARY KEY(`run_at`, `team`, `game_id`)
);
--> statement-breakpoint
CREATE INDEX `stakes_team` ON `stakes` (`season`,`team`,`game_id`);