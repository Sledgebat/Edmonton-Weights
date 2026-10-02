CREATE TABLE `playoff_odds` (
	`run_at` integer NOT NULL,
	`season` integer NOT NULL,
	`team` text NOT NULL,
	`gp` integer NOT NULL,
	`points` integer NOT NULL,
	`odds` real NOT NULL,
	`proj_points` real NOT NULL,
	PRIMARY KEY(`run_at`, `team`)
);
--> statement-breakpoint
CREATE INDEX `playoff_odds_season` ON `playoff_odds` (`season`,`team`);