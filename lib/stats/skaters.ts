/**
 * Skater season numbers we add up ourselves (for any team), next to the NHL's own season stats:
 *
 *   Primary points   goals plus first assists (first assists from the stored goals, or from the
 *                    shift data for a season without them)
 *   5-on-5 P/60      points at 5 on 5 per 60 minutes of 5-on-5 ice time, counted only in games
 *                    with shift data so the points and the minutes cover the same games
 *   Physical         faceoffs won and lost, penalties drawn and taken, blocks, hits, giveaways,
 *                    takeaways (hits, giveaways, takeaways from 2026-27 only)
 */
import { getDb } from "@/db";
import { hasGoalData } from "@/lib/stats/clutch";

/** The first season with hits, giveaways and takeaways stored. */
export const PHYSICAL_FROM_SEASON = 20262027;

/** Below this much 5-on-5 time, points per 60 is too noisy to show. */
export const MIN_P60_SECONDS = 50 * 60;

export type SkaterExtras = {
  a1: number;
  /** Null when the season has no stored goals to tell 5-on-5 points apart. */
  points5: number | null;
  toi5: number;
  fow: number;
  fol: number;
  pd: number;
  pt: number;
  blk: number;
  /** Null for seasons before these were counted. */
  hits: number | null;
  giveaways: number | null;
  takeaways: number | null;
};

/** Points per 60 at 5 on 5, or null below the minimum ice time or without goal data. */
export function pointsPer60(points5: number | null, toi5: number): number | null {
  if (points5 === null || toi5 < MIN_P60_SECONDS) return null;
  return (points5 * 3600) / toi5;
}

export function skaterExtras(season: number, teamId: number, gameType = 2): Map<number, SkaterExtras> {
  const db = getDb().$client;
  const sums = db
    .prepare(
      `SELECT player_id id, SUM(a1) a1, SUM(toi5) toi5, SUM(fow) fow, SUM(fol) fol, SUM(pd) pd, SUM(pt) pt, SUM(blk) blk,
         SUM(hits) hits, SUM(giveaways) giveaways, SUM(takeaways) takeaways
       FROM player_games WHERE season = ? AND game_type = ? AND team_id = ? AND pos != 'G'
       GROUP BY player_id`,
    )
    .all(season, gameType, teamId) as ({ id: number } & Omit<SkaterExtras, "points5">)[];

  const goals = hasGoalData(season);
  // First assists from the goals table where we have it (it's stored as games are added).
  const a1 = goals
    ? new Map(
        (
          db
            .prepare(`SELECT a1_id id, COUNT(*) n FROM goals WHERE season = ? AND game_type = ? AND team_id = ? AND a1_id IS NOT NULL GROUP BY a1_id`)
            .all(season, gameType, teamId) as { id: number; n: number }[]
        ).map((r) => [r.id, r.n]),
      )
    : null;
  // 5-on-5 goals and assists, only in games where the player has shift data (so TOI matches).
  const points5 = goals
    ? new Map(
        (
          db
            .prepare(
              `SELECT p.id, COUNT(*) n FROM (
                 SELECT g.game_id, g.scorer_id id FROM goals g JOIN shots s ON s.game_id = g.game_id AND s.event_id = g.event_id
                   WHERE g.season = @season AND g.game_type = @gameType AND g.team_id = @teamId AND s.strength = '5v5'
                 UNION ALL SELECT g.game_id, g.a1_id FROM goals g JOIN shots s ON s.game_id = g.game_id AND s.event_id = g.event_id
                   WHERE g.season = @season AND g.game_type = @gameType AND g.team_id = @teamId AND s.strength = '5v5'
                 UNION ALL SELECT g.game_id, g.a2_id FROM goals g JOIN shots s ON s.game_id = g.game_id AND s.event_id = g.event_id
                   WHERE g.season = @season AND g.game_type = @gameType AND g.team_id = @teamId AND s.strength = '5v5'
               ) p JOIN player_games pg ON pg.game_id = p.game_id AND pg.player_id = p.id
               WHERE p.id IS NOT NULL GROUP BY p.id`,
            )
            .all({ season, gameType, teamId }) as { id: number; n: number }[]
        ).map((r) => [r.id, r.n]),
      )
    : null;

  const out = new Map<number, SkaterExtras>();
  for (const r of sums) {
    const { id, ...rest } = r;
    out.set(id, { ...rest, a1: a1 ? (a1.get(id) ?? 0) : rest.a1, points5: points5 ? (points5.get(id) ?? 0) : null });
  }
  // A first assist in a game without shift data still counts toward primary points.
  for (const [id, n] of a1 ?? []) {
    if (!out.has(id)) out.set(id, { a1: n, points5: null, toi5: 0, fow: 0, fol: 0, pd: 0, pt: 0, blk: 0, hits: null, giveaways: null, takeaways: null });
  }
  return out;
}
