/**
 * Goalie game-by-game numbers from the stored shots, for any team.
 *
 *   Starter          the goalie who faced his team's first shot on goal against
 *   Quality start    (Rob Vollman) a start with a save % at or above the league's average that
 *                    season, or at least .885 on 20 or fewer shots
 *   Really bad start a start with a save % below .850
 *   Stolen game      a win where the goalie saved 2 or more goals above expected in that game,
 *                    and at least as many as the winning margin (empty-net goals left out of
 *                    the margin), so a blowout he starred in doesn't count
 *   HD save %        save % on high-danger shots on goal
 *
 * Empty-net goals don't count: they have no goalie.
 */
import { getDb } from "@/db";

export const QS_SMALL_SHOTS = 20;
export const QS_SMALL_SV = 0.885;
export const BAD_START_SV = 0.85;
export const STOLEN_GSAX = 2;

/** One goalie's numbers in one game. */
export type GoalieGame = {
  gameId: number;
  goalieId: number;
  teamId: number;
  started: boolean;
  won: boolean;
  /** Final margin from his team's side, not counting its empty-net goals. */
  margin: number;
  shots: number;
  goals: number;
  /** Goals saved above expected: expected goals on unblocked shots faced minus goals allowed. */
  gsax: number;
  hdShots: number;
  hdGoals: number;
};

export type GoalieStarts = {
  goalieId: number;
  teamId: number;
  starts: number;
  qualityStarts: number;
  badStarts: number;
  stolen: number;
  hdShots: number;
  hdGoals: number;
};

/** Vollman's quality start: league-average save % or better, or .885+ on a light night. */
export function isQualityStart(shots: number, goals: number, leagueSv: number): boolean {
  if (shots === 0) return goals === 0;
  const sv = 1 - goals / shots;
  return sv >= leagueSv || (shots <= QS_SMALL_SHOTS && sv >= QS_SMALL_SV);
}

export function isBadStart(shots: number, goals: number): boolean {
  return shots > 0 && 1 - goals / shots < BAD_START_SV;
}

export const isStolen = (g: Pick<GoalieGame, "won" | "gsax" | "margin">) => g.won && g.gsax >= STOLEN_GSAX && g.gsax >= g.margin;

/** Add each goalie's games up (per team, so a traded goalie has a row for each). */
export function summariseStarts(games: GoalieGame[], leagueSv: number): GoalieStarts[] {
  const out = new Map<string, GoalieStarts>();
  for (const g of games) {
    const key = `${g.goalieId}:${g.teamId}`;
    const s = out.get(key) ?? { goalieId: g.goalieId, teamId: g.teamId, starts: 0, qualityStarts: 0, badStarts: 0, stolen: 0, hdShots: 0, hdGoals: 0 };
    if (g.started) {
      s.starts++;
      if (isQualityStart(g.shots, g.goals, leagueSv)) s.qualityStarts++;
      if (isBadStart(g.shots, g.goals)) s.badStarts++;
    }
    if (isStolen(g)) s.stolen++;
    s.hdShots += g.hdShots;
    s.hdGoals += g.hdGoals;
    out.set(key, s);
  }
  return [...out.values()];
}

/** League save % on shots on goal for a season (empty-net goals left out). */
export function leagueSavePct(season: number, gameType = 2): number {
  const r = getDb()
    .$client.prepare(
      `SELECT SUM(type IN ('shot-on-goal', 'goal')) shots, SUM(is_goal) goals
       FROM shots WHERE season = ? AND game_type = ? AND goalie_id IS NOT NULL`,
    )
    .get(season, gameType) as { shots: number | null; goals: number | null };
  return r.shots ? 1 - (r.goals ?? 0) / r.shots : 0.9;
}

/** Every goalie's games in a season (or only one team's goalies). */
export function goalieGames(season: number, { teamId, gameType = 2 }: { teamId?: number; gameType?: number } = {}): GoalieGame[] {
  const db = getDb().$client;
  const team = teamId === undefined ? "" : ` AND s.opp_team_id = ${Number(teamId)}`;
  const rows = db
    .prepare(
      `SELECT s.game_id gameId, s.goalie_id goalieId, s.opp_team_id teamId,
         SUM(s.type IN ('shot-on-goal', 'goal')) shots,
         SUM(s.is_goal) goals,
         SUM(s.xg) - SUM(s.is_goal) gsax,
         SUM(s.high_danger = 1 AND s.type IN ('shot-on-goal', 'goal')) hdShots,
         SUM(s.high_danger = 1 AND s.is_goal = 1) hdGoals,
         CASE WHEN g.home_id = s.opp_team_id THEN g.home_score > g.away_score ELSE g.away_score > g.home_score END won,
         CASE WHEN g.home_id = s.opp_team_id THEN g.home_score - g.away_score ELSE g.away_score - g.home_score END
           - (SELECT COUNT(*) FROM shots e WHERE e.game_id = s.game_id AND e.team_id = s.opp_team_id AND e.is_goal = 1 AND e.strength = 'EN') margin
       FROM shots s JOIN stats_games g ON g.id = s.game_id
       WHERE s.season = ? AND s.game_type = ? AND s.goalie_id IS NOT NULL AND s.type != 'blocked-shot'${team}
       GROUP BY s.game_id, s.goalie_id, s.opp_team_id`,
    )
    .all(season, gameType) as (Omit<GoalieGame, "started" | "won"> & { won: number })[];
  // The starter faced his team's first shot on goal of the game.
  const starters = db
    .prepare(
      `SELECT game_id gameId, opp_team_id teamId, goalie_id goalieId FROM (
         SELECT s.game_id, s.opp_team_id, s.goalie_id,
           ROW_NUMBER() OVER (PARTITION BY s.game_id, s.opp_team_id ORDER BY s.game_seconds, s.event_id) n
         FROM shots s
         WHERE s.season = ? AND s.game_type = ? AND s.goalie_id IS NOT NULL AND s.type IN ('shot-on-goal', 'goal')${team}
       ) WHERE n = 1`,
    )
    .all(season, gameType) as { gameId: number; teamId: number; goalieId: number }[];
  const started = new Set(starters.map((s) => `${s.gameId}:${s.teamId}:${s.goalieId}`));
  return rows.map((r) => ({ ...r, won: !!r.won, started: started.has(`${r.gameId}:${r.teamId}:${r.goalieId}`) }));
}

/** Starts, quality starts, really bad starts, stolen games and high-danger shots for a team's goalies. */
export function goalieStarts(season: number, teamId?: number): GoalieStarts[] {
  return summariseStarts(goalieGames(season, { teamId }), leagueSavePct(season));
}
