/**
 * Public, typed NHL data API for server components, route handlers and the worker.
 *
 *   const { data, meta } = await nhl.standings();
 *   meta.fetchedAt  -> "last updated" stamp
 *   meta.stale      -> true when the NHL couldn't be reached and a cached copy is shown
 */
import { getResource } from "./client";
import { TEAM, TEAM_ID, endpoints, type GameType } from "./endpoints";
import "./replay"; // registers the replay hook
import {
  Boxscore,
  ClubSchedule,
  EdgeGoalie,
  EdgeSkater,
  EdgeTeam,
  TeamPenaltyKill,
  TeamPowerPlay,
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

export const nhl = {
  standings: () => getResource(endpoints.standingsNow(), Standings),
  schedule: (team = TEAM) => getResource(endpoints.scheduleNow(team), ClubSchedule),
  scheduleSeason: (season: number, team = TEAM) => getResource(endpoints.scheduleSeason(season, team), ClubSchedule),
  score: () => getResource(endpoints.scoreNow(), Scoreboard),
  gameLanding: (gameId: number) => getResource(endpoints.gameLanding(gameId), GameLanding),
  playByPlay: (gameId: number) => getResource(endpoints.gamePlayByPlay(gameId), PlayByPlay),
  boxscore: (gameId: number) => getResource(endpoints.gameBoxscore(gameId), Boxscore),
  roster: (team = TEAM) => getResource(endpoints.rosterCurrent(team), Roster),
  clubStats: (team = TEAM) => getResource(endpoints.clubStatsNow(team), ClubStats),
  clubStatsSeason: (season: number, gameType: GameType = 2, team = TEAM) =>
    getResource(endpoints.clubStatsSeason(season, gameType, team), ClubStats),
  player: (playerId: number) => getResource(endpoints.playerLanding(playerId), PlayerLanding),
  gameLog: (playerId: number, season: number, gameType: GameType = 2) =>
    getResource(endpoints.playerGameLog(playerId, season, gameType), PlayerGameLog),
  prospects: (team = TEAM) => getResource(endpoints.prospects(team), Prospects),
  teamSummary: (season: number, gameType: GameType = 2) => getResource(endpoints.teamSummary(season, gameType), TeamSummary),
  teamPowerPlay: (season: number, gameType: GameType = 2) => getResource(endpoints.teamPowerPlay(season, gameType), TeamPowerPlay),
  teamPenaltyKill: (season: number, gameType: GameType = 2) => getResource(endpoints.teamPenaltyKill(season, gameType), TeamPenaltyKill),
  edgeTeam: (teamId = TEAM_ID) => getResource(endpoints.edgeTeam(teamId), EdgeTeam),
  edgeSkater: (playerId: number) => getResource(endpoints.edgeSkater(playerId), EdgeSkater),
  edgeGoalie: (playerId: number) => getResource(endpoints.edgeGoalie(playerId), EdgeGoalie),
};

export { NhlError, cacheStatus, nhlMode, type Meta, type NhlMode, type Result, type Source } from "./client";
export * from "./schemas";
