/**
 * Team and goalie advanced stats from the stored shots, with league ranks.
 *
 *   5v5 shares   CF% (all attempts), FF%, SF%, xGF% (expected goals), HDCF% (high-danger chances)
 *   Rates        per 60 minutes of the relevant strength (5v5, power play, penalty kill)
 *   PDO          5v5 shooting % + save %, a luck gauge that drifts back toward 100 over time
 *   GSAx         goals saved above expected: expected goals faced minus goals allowed
 */
import { getDb } from "@/db";

export type TeamRow = {
  teamId: number;
  abbrev: string;
  gp: number;
  /** All situations. */
  xgf: number;
  xga: number;
  /** 5v5. */
  toi5: number;
  cf: number;
  ca: number;
  ff: number;
  fa: number;
  sf: number;
  sa: number;
  gf5: number;
  ga5: number;
  xgf5: number;
  xga5: number;
  hdcf: number;
  hdca: number;
  /** Power play (for) and penalty kill (against). */
  toiPP: number;
  xgfPP: number;
  gfPP: number;
  toiSH: number;
  xgaSH: number;
  gaSH: number;
};

export type TeamMetrics = {
  cfPct: number;
  ffPct: number;
  sfPct: number;
  xgfPct: number;
  hdcfPct: number;
  pdo: number;
  xgf60: number;
  xga60: number;
  cf60: number;
  ca60: number;
  hdcf60: number;
  hdca60: number;
  ppXgf60: number;
  pkXga60: number;
  xgfPerGame: number;
  xgaPerGame: number;
};

export type MetricKey = keyof TeamMetrics;

/** Which direction is good, and how to talk about each metric. */
export const METRICS: Record<MetricKey, { label: string; higherIsBetter: boolean; format: "pct" | "rate" | "pdo"; explain: string }> = {
  cfPct: { label: "Shot share (CF%)", higherIsBetter: true, format: "pct", explain: "Share of all 5-on-5 shot attempts, including blocked and missed. Over 50% means you have the puck more." },
  ffPct: { label: "Unblocked shot share (FF%)", higherIsBetter: true, format: "pct", explain: "Share of 5-on-5 shot attempts that weren't blocked." },
  sfPct: { label: "Shots on goal share", higherIsBetter: true, format: "pct", explain: "Share of 5-on-5 shots on goal." },
  xgfPct: { label: "Expected goals share (xGF%)", higherIsBetter: true, format: "pct", explain: "Share of 5-on-5 expected goals, which weights every shot by its chance of going in. The best single measure of who's controlling play." },
  hdcfPct: { label: "High-danger chance share", higherIsBetter: true, format: "pct", explain: "Share of 5-on-5 chances from the area right in front of the net, plus rebounds from the slot." },
  pdo: { label: "PDO (luck gauge)", higherIsBetter: true, format: "pdo", explain: "5-on-5 shooting % plus save %. Around 100 is normal; well above usually means hot shooting or goaltending that won't last." },
  xgf60: { label: "Expected goals for per 60", higherIsBetter: true, format: "rate", explain: "5-on-5 expected goals created per 60 minutes." },
  xga60: { label: "Expected goals against per 60", higherIsBetter: false, format: "rate", explain: "5-on-5 expected goals allowed per 60 minutes. Lower is better." },
  cf60: { label: "Shot attempts for per 60", higherIsBetter: true, format: "rate", explain: "5-on-5 shot attempts per 60 minutes." },
  ca60: { label: "Shot attempts against per 60", higherIsBetter: false, format: "rate", explain: "5-on-5 shot attempts allowed per 60 minutes. Lower is better." },
  hdcf60: { label: "High-danger chances for per 60", higherIsBetter: true, format: "rate", explain: "5-on-5 high-danger chances created per 60 minutes." },
  hdca60: { label: "High-danger chances against per 60", higherIsBetter: false, format: "rate", explain: "5-on-5 high-danger chances allowed per 60 minutes. Lower is better." },
  ppXgf60: { label: "Power play xG per 60", higherIsBetter: true, format: "rate", explain: "Expected goals created per 60 minutes of power play: how dangerous the power play is, beyond whether it scored." },
  pkXga60: { label: "Penalty kill xG against per 60", higherIsBetter: false, format: "rate", explain: "Expected goals allowed per 60 minutes shorthanded. Lower is better." },
  xgfPerGame: { label: "Expected goals for per game", higherIsBetter: true, format: "rate", explain: "Expected goals created per game, all situations." },
  xgaPerGame: { label: "Expected goals against per game", higherIsBetter: false, format: "rate", explain: "Expected goals allowed per game, all situations. Lower is better." },
};

const share = (a: number, b: number) => (a + b > 0 ? (a / (a + b)) * 100 : 50);
const per60 = (n: number, seconds: number) => (seconds > 0 ? (n * 3600) / seconds : 0);

export function metricsOf(r: TeamRow): TeamMetrics {
  const sh = r.sf > 0 ? r.gf5 / r.sf : 0;
  const sv = r.sa > 0 ? 1 - r.ga5 / r.sa : 1;
  return {
    cfPct: share(r.cf, r.ca),
    ffPct: share(r.ff, r.fa),
    sfPct: share(r.sf, r.sa),
    xgfPct: share(r.xgf5, r.xga5),
    hdcfPct: share(r.hdcf, r.hdca),
    pdo: (sh + sv) * 100,
    xgf60: per60(r.xgf5, r.toi5),
    xga60: per60(r.xga5, r.toi5),
    cf60: per60(r.cf, r.toi5),
    ca60: per60(r.ca, r.toi5),
    hdcf60: per60(r.hdcf, r.toi5),
    hdca60: per60(r.hdca, r.toi5),
    ppXgf60: per60(r.xgfPP, r.toiPP),
    pkXga60: per60(r.xgaSH, r.toiSH),
    xgfPerGame: r.gp ? r.xgf / r.gp : 0,
    xgaPerGame: r.gp ? r.xga / r.gp : 0,
  };
}

export type RankedTeam = TeamRow & { metrics: TeamMetrics; ranks: Record<MetricKey, number> };

/** 1 = best in the league for every metric (direction from METRICS). Ties share a rank. */
export function rankTeams(rows: TeamRow[]): RankedTeam[] {
  const withMetrics = rows.map((r) => ({ ...r, metrics: metricsOf(r), ranks: {} as Record<MetricKey, number> }));
  for (const key of Object.keys(METRICS) as MetricKey[]) {
    const dir = METRICS[key].higherIsBetter ? -1 : 1;
    const sorted = [...withMetrics].sort((a, b) => dir * (a.metrics[key] - b.metrics[key]));
    sorted.forEach((t, i) => {
      const prev = sorted[i - 1];
      t.ranks[key] = prev && Math.abs(prev.metrics[key] - t.metrics[key]) < 1e-9 ? prev.ranks[key] : i + 1;
    });
  }
  return withMetrics;
}

type Filter = { season: number; gameType?: number; gameIds?: number[] };

function where(f: Filter, alias = "") {
  const a = alias ? `${alias}.` : "";
  const parts = [`${a}season = ${Number(f.season)}`, `${a}game_type = ${Number(f.gameType ?? 2)}`];
  if (f.gameIds) parts.push(f.gameIds.length ? `${a}game_id IN (${f.gameIds.map(Number).join(",")})` : "0");
  return parts.join(" AND ");
}

/** Raw counts for every team (or the games given) in a season. */
export function teamRows(f: Filter): TeamRow[] {
  const db = getDb().$client;
  const w = where(f);
  const gamesWhere = `season = ${Number(f.season)} AND game_type = ${Number(f.gameType ?? 2)}${
    f.gameIds ? (f.gameIds.length ? ` AND id IN (${f.gameIds.map(Number).join(",")})` : " AND 0") : ""
  }`;

  const teams = db
    .prepare(
      `SELECT team_id, abbrev, COUNT(*) AS gp FROM (
         SELECT home_id AS team_id, home_abbrev AS abbrev FROM stats_games WHERE ${gamesWhere}
         UNION ALL SELECT away_id, away_abbrev FROM stats_games WHERE ${gamesWhere}
       ) GROUP BY team_id`,
    )
    .all() as { team_id: number; abbrev: string; gp: number }[];

  const side = (col: "team_id" | "opp_team_id", strength: string | null) =>
    db
      .prepare(
        `SELECT ${col} AS t,
           COUNT(*) AS c,
           SUM(type != 'blocked-shot') AS f,
           SUM(type IN ('shot-on-goal', 'goal')) AS s,
           SUM(is_goal) AS g,
           SUM(xg) AS xg,
           SUM(high_danger) AS hd
         FROM shots WHERE ${w}${strength ? ` AND strength = '${strength}'` : ""} GROUP BY ${col}`,
      )
      .all() as { t: number; c: number; f: number; s: number; g: number; xg: number; hd: number }[];
  const index = <T extends { t: number }>(rows: T[]) => new Map(rows.map((r) => [r.t, r]));

  const for5 = index(side("team_id", "5v5"));
  const against5 = index(side("opp_team_id", "5v5"));
  const forAll = index(side("team_id", null));
  const againstAll = index(side("opp_team_id", null));
  const forPP = index(side("team_id", "PP"));
  const againstPK = index(side("opp_team_id", "PP"));

  const time = db
    .prepare(
      `SELECT st.team_id AS t, st.strength AS strength, SUM(st.seconds) AS seconds
       FROM strength_time st JOIN stats_games g ON g.id = st.game_id
       WHERE ${gamesWhere.replace(/\b(season|game_type|id)\b/g, "g.$1")}
       GROUP BY st.team_id, st.strength`,
    )
    .all() as { t: number; strength: string; seconds: number }[];
  const toi = (t: number, s: string) => time.find((x) => x.t === t && x.strength === s)?.seconds ?? 0;

  return teams.map((tm) => {
    const t = tm.team_id;
    const f5 = for5.get(t);
    const a5 = against5.get(t);
    return {
      teamId: t,
      abbrev: tm.abbrev,
      gp: tm.gp,
      xgf: forAll.get(t)?.xg ?? 0,
      xga: againstAll.get(t)?.xg ?? 0,
      toi5: toi(t, "5v5"),
      cf: f5?.c ?? 0,
      ca: a5?.c ?? 0,
      ff: f5?.f ?? 0,
      fa: a5?.f ?? 0,
      sf: f5?.s ?? 0,
      sa: a5?.s ?? 0,
      gf5: f5?.g ?? 0,
      ga5: a5?.g ?? 0,
      xgf5: f5?.xg ?? 0,
      xga5: a5?.xg ?? 0,
      hdcf: f5?.hd ?? 0,
      hdca: a5?.hd ?? 0,
      toiPP: toi(t, "PP"),
      xgfPP: forPP.get(t)?.xg ?? 0,
      gfPP: forPP.get(t)?.g ?? 0,
      toiSH: toi(t, "SH"),
      xgaSH: againstPK.get(t)?.xg ?? 0,
      gaSH: againstPK.get(t)?.g ?? 0,
    };
  });
}

/** Every team's metrics and league ranks for a season. */
export function leagueTable(season: number, gameType = 2): RankedTeam[] {
  return rankTeams(teamRows({ season, gameType }));
}

/** League average of each metric (mean of team values). */
export function leagueAverages(table: RankedTeam[]): TeamMetrics {
  const keys = Object.keys(METRICS) as MetricKey[];
  return Object.fromEntries(
    keys.map((k) => [k, table.length ? table.reduce((s, t) => s + t.metrics[k], 0) / table.length : 0]),
  ) as TeamMetrics;
}

// ------------------------------------------------------------------ per-game log

export type TeamGame = {
  gameId: number;
  date: string;
  isHome: boolean;
  opponent: string;
  gf: number;
  ga: number;
  lastPeriodType: string;
  cf5: number;
  ca5: number;
  xgf: number;
  xga: number;
  xgf5: number;
  xga5: number;
  hdcf: number;
  hdca: number;
};

/** One row per game for a team, oldest first. */
export function teamGames(teamId: number, season: number, gameType = 2): TeamGame[] {
  const db = getDb().$client;
  const games = db
    .prepare(
      `SELECT * FROM stats_games WHERE season = ? AND game_type = ? AND (home_id = ? OR away_id = ?) ORDER BY game_date, id`,
    )
    .all(season, gameType, teamId, teamId) as {
    id: number;
    game_date: string;
    home_id: number;
    away_abbrev: string;
    home_abbrev: string;
    home_score: number;
    away_score: number;
    last_period_type: string;
  }[];
  const agg = db.prepare(
    `SELECT
       SUM(CASE WHEN team_id = @t AND strength = '5v5' THEN 1 ELSE 0 END) AS cf5,
       SUM(CASE WHEN opp_team_id = @t AND strength = '5v5' THEN 1 ELSE 0 END) AS ca5,
       SUM(CASE WHEN team_id = @t THEN xg ELSE 0 END) AS xgf,
       SUM(CASE WHEN opp_team_id = @t THEN xg ELSE 0 END) AS xga,
       SUM(CASE WHEN team_id = @t AND strength = '5v5' THEN xg ELSE 0 END) AS xgf5,
       SUM(CASE WHEN opp_team_id = @t AND strength = '5v5' THEN xg ELSE 0 END) AS xga5,
       SUM(CASE WHEN team_id = @t AND strength = '5v5' THEN high_danger ELSE 0 END) AS hdcf,
       SUM(CASE WHEN opp_team_id = @t AND strength = '5v5' THEN high_danger ELSE 0 END) AS hdca
     FROM shots WHERE game_id = @g`,
  );
  return games.map((g) => {
    const isHome = g.home_id === teamId;
    const a = agg.get({ t: teamId, g: g.id }) as Omit<TeamGame, "gameId" | "date" | "isHome" | "opponent" | "gf" | "ga" | "lastPeriodType">;
    return {
      gameId: g.id,
      date: g.game_date,
      isHome,
      opponent: isHome ? g.away_abbrev : g.home_abbrev,
      gf: isHome ? g.home_score : g.away_score,
      ga: isHome ? g.away_score : g.home_score,
      lastPeriodType: g.last_period_type,
      cf5: a.cf5 ?? 0,
      ca5: a.ca5 ?? 0,
      xgf: a.xgf ?? 0,
      xga: a.xga ?? 0,
      xgf5: a.xgf5 ?? 0,
      xga5: a.xga5 ?? 0,
      hdcf: a.hdcf ?? 0,
      hdca: a.hdca ?? 0,
    };
  });
}

/** Rolling share (e.g. xGF%) over the last `window` games, for the trend chart. */
export function rollingShare(games: TeamGame[], forKey: keyof TeamGame, againstKey: keyof TeamGame, window = 5) {
  return games.map((g, i) => {
    const slice = games.slice(Math.max(0, i - window + 1), i + 1);
    const f = slice.reduce((s, x) => s + (x[forKey] as number), 0);
    const a = slice.reduce((s, x) => s + (x[againstKey] as number), 0);
    return { gameId: g.gameId, date: g.date, value: share(f, a) };
  });
}

// ------------------------------------------------------------------ goalies and shooters

export type GoalieRow = { goalieId: number; teamId: number; shotsFaced: number; goalsAllowed: number; xga: number; gsax: number; svPct: number; xSvPct: number };

/** Goals saved above expected for every goalie (shots on goal and goals faced, all situations). */
export function goalieTable(season: number, gameType = 2): GoalieRow[] {
  const rows = getDb()
    .$client.prepare(
      `SELECT goalie_id AS goalieId, opp_team_id AS teamId,
         SUM(type IN ('shot-on-goal', 'goal')) AS shotsFaced,
         SUM(is_goal) AS goalsAllowed,
         SUM(CASE WHEN type IN ('shot-on-goal', 'goal') THEN xg ELSE 0 END) AS xgOnTarget,
         SUM(xg) AS xga
       FROM shots WHERE season = ? AND game_type = ? AND goalie_id IS NOT NULL
       GROUP BY goalie_id, opp_team_id`,
    )
    .all(season, gameType) as { goalieId: number; teamId: number; shotsFaced: number; goalsAllowed: number; xga: number; xgOnTarget: number }[];
  return rows.map((r) => ({
    goalieId: r.goalieId,
    teamId: r.teamId,
    shotsFaced: r.shotsFaced,
    goalsAllowed: r.goalsAllowed,
    xga: r.xga,
    gsax: r.xga - r.goalsAllowed,
    svPct: r.shotsFaced ? 1 - r.goalsAllowed / r.shotsFaced : 0,
    // Expected save % on shots that reached the net.
    xSvPct: r.shotsFaced ? 1 - r.xgOnTarget / r.shotsFaced : 0,
  }));
}

export type ShooterRow = { playerId: number; teamId: number; attempts: number; shots: number; goals: number; ixg: number; hdChances: number };

/** Individual shooting for a team's players (all situations). */
export function shooterTable(teamId: number, season: number, gameType = 2): ShooterRow[] {
  return getDb()
    .$client.prepare(
      `SELECT shooter_id AS playerId, team_id AS teamId, COUNT(*) AS attempts,
         SUM(type IN ('shot-on-goal', 'goal')) AS shots, SUM(is_goal) AS goals,
         SUM(xg) AS ixg, SUM(high_danger) AS hdChances
       FROM shots WHERE team_id = ? AND season = ? AND game_type = ? AND shooter_id IS NOT NULL
       GROUP BY shooter_id ORDER BY ixg DESC`,
    )
    .all(teamId, season, gameType) as ShooterRow[];
}
