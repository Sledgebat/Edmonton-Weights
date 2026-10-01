/**
 * Which schema validates each endpoint, and how long a response stays fresh.
 * Refresh intervals follow the plan's Data sources table; live game data refreshes
 * every 20 s, finished games are effectively immutable.
 */
import type { z } from "zod";
import { isFinished, isLive } from "./endpoints";
import {
  Boxscore,
  ClubSchedule,
  EdgePlayer,
  EdgeTeam,
  TeamSummary,
  ClubStats,
  GameLanding,
  PlayByPlay,
  PlayerGameLog,
  PlayerLanding,
  Prospects,
  Roster,
  Scoreboard,
  Standings,
} from "./schemas";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Today's date in Edmonton, as YYYY-MM-DD. */
export function edmontonDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type GameLike = { gameState: string; gameDate?: string };
const hasUnfinishedGameToday = (games: GameLike[], now: Date) => {
  const today = edmontonDate(now);
  return games.some((g) => isLive(g.gameState) || (g.gameDate === today && !isFinished(g.gameState)));
};

/** TTL for a single game's gamecenter data, by state. */
function gameTtl(state: string, liveMs: number): number {
  if (isLive(state)) return liveMs;
  if (state === "PRE") return 1 * MIN;
  if (state === "FINAL") return 5 * MIN; // stat corrections still land
  if (state === "OFF") return 1 * DAY;
  return 15 * MIN; // FUT
}

export type Resource = {
  /** Human label for the status page. */
  label: string;
  pattern: RegExp;
  schema: z.ZodType;
  /** Milliseconds until this response should be refetched. */
  ttl: (data: unknown, now: Date) => number;
};

export const RESOURCES: Resource[] = [
  {
    label: "Standings",
    pattern: /^\/standings\/now$/,
    schema: Standings,
    ttl: () => 10 * MIN,
  },
  {
    label: "Schedule",
    pattern: /^\/club-schedule-season\/[A-Z]{3}\/now$/,
    schema: ClubSchedule,
    ttl: (d, now) => (hasUnfinishedGameToday((d as ClubSchedule).games, now) ? 5 * MIN : 1 * HOUR),
  },
  {
    label: "Schedule (past season)",
    pattern: /^\/club-schedule-season\/[A-Z]{3}\/\d{8}$/,
    schema: ClubSchedule,
    ttl: (d) => ((d as ClubSchedule).games.every((g) => isFinished(g.gameState)) ? 30 * DAY : 1 * HOUR),
  },
  {
    label: "Scoreboard",
    pattern: /^\/score\/now$/,
    schema: Scoreboard,
    ttl: (d, now) => (hasUnfinishedGameToday((d as Scoreboard).games, now) ? 1 * MIN : 10 * MIN),
  },
  {
    label: "Game summary",
    pattern: /^\/gamecenter\/\d+\/landing$/,
    schema: GameLanding,
    ttl: (d) => gameTtl((d as GameLanding).gameState, 20 * SEC),
  },
  {
    label: "Play-by-play",
    pattern: /^\/gamecenter\/\d+\/play-by-play$/,
    schema: PlayByPlay,
    ttl: (d) => gameTtl((d as PlayByPlay).gameState, 20 * SEC),
  },
  {
    label: "Box score",
    pattern: /^\/gamecenter\/\d+\/boxscore$/,
    schema: Boxscore,
    ttl: (d) => gameTtl((d as Boxscore).gameState, 30 * SEC),
  },
  {
    label: "Roster",
    pattern: /^\/roster\/[A-Z]{3}\/current$/,
    schema: Roster,
    ttl: () => 1 * DAY,
  },
  {
    label: "Team stats",
    pattern: /^\/club-stats\/[A-Z]{3}\/now$/,
    schema: ClubStats,
    ttl: () => 1 * HOUR,
  },
  {
    label: "Player",
    pattern: /^\/player\/\d+\/landing$/,
    schema: PlayerLanding,
    ttl: () => 12 * HOUR,
  },
  {
    label: "Player game log",
    pattern: /^\/player\/\d+\/game-log\/\d{8}\/[123]$/,
    schema: PlayerGameLog,
    ttl: (d, now) => {
      // Past seasons don't change; the current season updates after each game.
      const endYear = (d as PlayerGameLog).seasonId % 10000;
      return now.getUTCFullYear() > endYear || (now.getUTCFullYear() === endYear && now.getUTCMonth() >= 7)
        ? 7 * DAY
        : 1 * HOUR;
    },
  },
  {
    label: "Team summary",
    pattern: /^\/stats\/rest\/en\/team\/summary\?/,
    schema: TeamSummary,
    ttl: () => 1 * HOUR,
  },
  {
    label: "NHL EDGE team",
    pattern: /^\/edge\/team-detail\/\d+\/now$/,
    schema: EdgeTeam,
    ttl: () => 12 * HOUR,
  },
  {
    label: "NHL EDGE player",
    pattern: /^\/edge\/(skater|goalie)-detail\/\d+\/now$/,
    schema: EdgePlayer,
    ttl: () => 12 * HOUR,
  },
  {
    label: "Prospects",
    pattern: /^\/prospects\/[A-Z]{3}$/,
    schema: Prospects,
    ttl: () => 7 * DAY,
  },
];

export function resourceForPath(path: string): Resource | undefined {
  return RESOURCES.find((r) => r.pattern.test(path));
}

export function schemaForPath(path: string): z.ZodType | undefined {
  return resourceForPath(path)?.schema;
}
