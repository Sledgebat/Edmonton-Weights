/**
 * Special teams, discipline and the physical game, per team for a season, with league ranks:
 *
 *   PP and SH goals for and against      from the NHL's reports (they count a power-play goal
 *                                        scored with the goalie pulled, which our shot data files
 *                                        as an extra-attacker goal); our shots as a fallback
 *   Power-play time per game             from strength_time
 *   Power-play opportunities, times      from the NHL's power-play and penalty-kill reports
 *   shorthanded
 *   Penalties drawn, taken, difference   summed from player_games (games with shift data)
 *   Hits, blocks, giveaways, takeaways   summed from player_games, per game
 */
import { getDb } from "@/db";
import { rankOf } from "@/lib/rank";

export type SpecialRow = {
  teamId: number;
  gp: number;
  ppGoalsFor: number;
  ppGoalsAgainst: number;
  shGoalsFor: number;
  shGoalsAgainst: number;
  /** Seconds on the power play per game. */
  ppSecondsPerGame: number;
  ppOpportunities: number | null;
  timesShorthanded: number | null;
  /** Games with player data (shift charts), which the per-game figures below are measured over. */
  playerGames: number;
  drawn: number;
  taken: number;
  hits: number | null;
  blocks: number;
  giveaways: number | null;
  takeaways: number | null;
};

export type SpecialKey = "ppGoalsFor" | "ppGoalsAgainst" | "shGoalsFor" | "shGoalsAgainst" | "ppTime" | "ppOpp" | "timesSH" | "penaltyDiff" | "hits" | "blocks" | "giveaways" | "takeaways";

/** How each number is ranked: per game, and which direction is good (null = not ranked). */
export const SPECIAL: Record<SpecialKey, { label: string; higherIsBetter: boolean | null; value: (r: SpecialRow) => number | null }> = {
  ppGoalsFor: { label: "Power-play goals for", higherIsBetter: true, value: (r) => r.ppGoalsFor / r.gp },
  ppGoalsAgainst: { label: "Power-play goals against", higherIsBetter: false, value: (r) => r.ppGoalsAgainst / r.gp },
  shGoalsFor: { label: "Shorthanded goals for", higherIsBetter: true, value: (r) => r.shGoalsFor / r.gp },
  shGoalsAgainst: { label: "Shorthanded goals against", higherIsBetter: false, value: (r) => r.shGoalsAgainst / r.gp },
  ppTime: { label: "Power-play time per game", higherIsBetter: true, value: (r) => r.ppSecondsPerGame },
  ppOpp: { label: "Power plays per game", higherIsBetter: true, value: (r) => (r.ppOpportunities === null ? null : r.ppOpportunities / r.gp) },
  timesSH: { label: "Times shorthanded per game", higherIsBetter: false, value: (r) => (r.timesShorthanded === null ? null : r.timesShorthanded / r.gp) },
  penaltyDiff: { label: "Penalties drawn minus taken, per game", higherIsBetter: true, value: (r) => (r.playerGames ? (r.drawn - r.taken) / r.playerGames : null) },
  // Physical counts depend on the arena scorekeeper and aren't clearly good or bad: ranked by volume, shown plain.
  hits: { label: "Hits per game", higherIsBetter: null, value: (r) => (r.hits === null || !r.playerGames ? null : r.hits / r.playerGames) },
  blocks: { label: "Blocked shots per game", higherIsBetter: null, value: (r) => (r.playerGames ? r.blocks / r.playerGames : null) },
  giveaways: { label: "Giveaways per game", higherIsBetter: null, value: (r) => (r.giveaways === null || !r.playerGames ? null : r.giveaways / r.playerGames) },
  takeaways: { label: "Takeaways per game", higherIsBetter: null, value: (r) => (r.takeaways === null || !r.playerGames ? null : r.takeaways / r.playerGames) },
};

/** Everything but the NHL report columns, from the database. */
export function specialRows(season: number, gameType = 2): Omit<SpecialRow, "ppOpportunities" | "timesShorthanded">[] {
  const db = getDb().$client;
  const games = db
    .prepare(
      `SELECT t, COUNT(*) gp FROM (
         SELECT home_id t FROM stats_games WHERE season = @season AND game_type = @gameType
         UNION ALL SELECT away_id FROM stats_games WHERE season = @season AND game_type = @gameType
       ) GROUP BY t`,
    )
    .all({ season, gameType }) as { t: number; gp: number }[];
  const goals = db
    .prepare(
      `SELECT team_id f, opp_team_id a, strength, COUNT(*) n FROM shots
       WHERE season = ? AND game_type = ? AND is_goal = 1 AND strength IN ('PP', 'SH') GROUP BY team_id, opp_team_id, strength`,
    )
    .all(season, gameType) as { f: number; a: number; strength: string; n: number }[];
  const pp = new Map(
    (
      db
        .prepare(
          `SELECT st.team_id t, SUM(st.seconds) s FROM strength_time st JOIN stats_games g ON g.id = st.game_id
           WHERE g.season = ? AND g.game_type = ? AND st.strength = 'PP' GROUP BY st.team_id`,
        )
        .all(season, gameType) as { t: number; s: number }[]
    ).map((r) => [r.t, r.s]),
  );
  const players = new Map(
    (
      db
        .prepare(
          `SELECT team_id t, COUNT(DISTINCT game_id) games, SUM(pd) drawn, SUM(pt) taken, SUM(blk) blocks,
             SUM(hits) hits, SUM(giveaways) giveaways, SUM(takeaways) takeaways
           FROM player_games WHERE season = ? AND game_type = ? GROUP BY team_id`,
        )
        .all(season, gameType) as { t: number; games: number; drawn: number; taken: number; blocks: number; hits: number | null; giveaways: number | null; takeaways: number | null }[]
    ).map((r) => [r.t, r]),
  );
  const sum = (pick: (g: (typeof goals)[number]) => boolean) => goals.filter(pick).reduce((s, g) => s + g.n, 0);
  return games.map(({ t, gp }) => {
    const p = players.get(t);
    return {
      teamId: t,
      gp,
      ppGoalsFor: sum((g) => g.f === t && g.strength === "PP"),
      ppGoalsAgainst: sum((g) => g.a === t && g.strength === "PP"),
      shGoalsFor: sum((g) => g.f === t && g.strength === "SH"),
      shGoalsAgainst: sum((g) => g.a === t && g.strength === "SH"),
      ppSecondsPerGame: (pp.get(t) ?? 0) / gp,
      playerGames: p?.games ?? 0,
      drawn: p?.drawn ?? 0,
      taken: p?.taken ?? 0,
      hits: p?.hits ?? null,
      blocks: p?.blocks ?? 0,
      giveaways: p?.giveaways ?? null,
      takeaways: p?.takeaways ?? null,
    };
  });
}

type PpReport = { teamId: number; ppOpportunities?: number | null; powerPlayGoalsFor?: number | null; shGoalsAgainst?: number | null };
type PkReport = { teamId: number; timesShorthanded?: number | null; ppGoalsAgainst?: number | null; shGoalsFor?: number | null };

/**
 * Add the NHL's power-play opportunities and times shorthanded (null when a report didn't load),
 * and use its power-play and shorthanded goal counts in place of ours where it has them.
 */
export function withReports(rows: Omit<SpecialRow, "ppOpportunities" | "timesShorthanded">[], pp: PpReport[] | null, pk: PkReport[] | null): SpecialRow[] {
  const ppBy = new Map((pp ?? []).map((r) => [r.teamId, r]));
  const pkBy = new Map((pk ?? []).map((r) => [r.teamId, r]));
  return rows.map((r) => {
    const a = ppBy.get(r.teamId);
    const b = pkBy.get(r.teamId);
    return {
      ...r,
      ppGoalsFor: a?.powerPlayGoalsFor ?? r.ppGoalsFor,
      shGoalsAgainst: a?.shGoalsAgainst ?? r.shGoalsAgainst,
      ppGoalsAgainst: b?.ppGoalsAgainst ?? r.ppGoalsAgainst,
      shGoalsFor: b?.shGoalsFor ?? r.shGoalsFor,
      ppOpportunities: a?.ppOpportunities ?? null,
      timesShorthanded: b?.timesShorthanded ?? null,
    };
  });
}

/** A team's value and league rank for one number (rank null when it isn't ranked or has no value). */
export function specialRank(rows: SpecialRow[], teamId: number, key: SpecialKey): { value: number | null; rank: number | null; of: number } {
  const def = SPECIAL[key];
  const values = rows.map(def.value).filter((v): v is number => v !== null);
  const own = rows.find((r) => r.teamId === teamId);
  const value = own ? def.value(own) : null;
  // Volume stats are ranked most-first but shown without colour.
  const higher = def.higherIsBetter ?? true;
  return { value, rank: value === null ? null : rankOf(value, values, higher), of: values.length };
}
