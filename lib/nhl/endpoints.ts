/**
 * Every NHL web-API endpoint the site uses, relative to NHL_API_BASE.
 * Shared by the fixture capture script (Phase 1) and the typed client (Phase 3).
 *
 * Source map: https://github.com/Zmalski/NHL-API-Reference
 * The API is public, keyless and undocumented, so it can change without notice.
 */

export const NHL_API_BASE = process.env.NHL_API_BASE ?? "https://api-web.nhle.com/v1";
export const TEAM = "EDM";
export const TEAM_ID = 22;

/** The NHL's stats REST API (team summaries: power play %, penalty kill %, faceoffs...). */
export const STATS_API_BASE = process.env.NHL_STATS_API_BASE ?? "https://api.nhle.com";

/** Which host serves a path: /stats/rest/... lives on api.nhle.com, everything else on api-web. */
export const baseFor = (path: string) => (path.startsWith("/stats/rest/") ? STATS_API_BASE : NHL_API_BASE);

/** First Oilers NHL season, used by the On This Day backfill. */
export const FIRST_NHL_SEASON = 19791980;

/** Descriptive User-Agent so the NHL can see who is calling (plan: "be polite"). */
export const USER_AGENT =
  "EdmontonWeights/0.1 (independent Oilers stats site; low-volume cached requests)";

export type GameType = 1 | 2 | 3; // 1 preseason, 2 regular season, 3 playoffs

export const endpoints = {
  standingsNow: () => `/standings/now`,
  scheduleNow: (team = TEAM) => `/club-schedule-season/${team}/now`,
  scheduleSeason: (season: number, team = TEAM) =>
    `/club-schedule-season/${team}/${season}`,
  scoreNow: () => `/score/now`,
  gameLanding: (gameId: number) => `/gamecenter/${gameId}/landing`,
  gamePlayByPlay: (gameId: number) => `/gamecenter/${gameId}/play-by-play`,
  gameBoxscore: (gameId: number) => `/gamecenter/${gameId}/boxscore`,
  rosterCurrent: (team = TEAM) => `/roster/${team}/current`,
  clubStatsNow: (team = TEAM) => `/club-stats/${team}/now`,
  playerLanding: (playerId: number) => `/player/${playerId}/landing`,
  playerGameLog: (playerId: number, season: number, gameType: GameType) =>
    `/player/${playerId}/game-log/${season}/${gameType}`,
  prospects: (team = TEAM) => `/prospects/${team}`,
  /** League-wide team summary for a season (one row per team). */
  teamSummary: (season: number, gameType: GameType = 2) =>
    `/stats/rest/en/team/summary?cayenneExp=seasonId=${season}%20and%20gameTypeId=${gameType}`,
  /** NHL EDGE tracking: season-to-date summaries with league ranks. */
  edgeTeam: (teamId = TEAM_ID) => `/edge/team-detail/${teamId}/now`,
  edgeSkater: (playerId: number) => `/edge/skater-detail/${playerId}/now`,
  edgeGoalie: (playerId: number) => `/edge/goalie-detail/${playerId}/now`,
} as const;

/** Game states the Game Day Hub switches on. */
export const GAME_STATES = ["FUT", "PRE", "LIVE", "CRIT", "FINAL", "OFF"] as const;
export type GameState = (typeof GAME_STATES)[number];
export const isFinished = (s: string) => s === "FINAL" || s === "OFF";
export const isLive = (s: string) => s === "LIVE" || s === "CRIT";

/** Known player IDs used for presets and fixtures. */
export const PLAYERS = {
  mcdavid: 8478402,
  draisaitl: 8477934,
} as const;

/**
 * Where a response for `path` lives under fixtures/.
 * `/standings/now` -> `fixtures/v1/standings/now.json`
 */
export function fixturePathFor(path: string): string {
  const clean = path.replace(/^\/+/, "").replace(/\?.*$/, "");
  if (!clean || clean.includes("..")) throw new Error(`Bad endpoint path: ${path}`);
  return `v1/${clean}.json`;
}

/** Season id helpers: 20262027 <-> "2026-27". */
export function seasonLabel(season: number): string {
  const start = Math.floor(season / 10000);
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function previousSeason(season: number): number {
  const start = Math.floor(season / 10000) - 1;
  return start * 10000 + (start + 1);
}

/** Every season id from 1979-80 up to and including `lastSeason`. */
export function seasonsSince(first: number, lastSeason: number): number[] {
  const out: number[] = [];
  for (let s = Math.floor(first / 10000); s <= Math.floor(lastSeason / 10000); s++) {
    out.push(s * 10000 + (s + 1));
  }
  return out;
}
