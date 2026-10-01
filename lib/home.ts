/**
 * Everything the home page shows, assembled on the server. Each part loads independently, so
 * one failing source (say NHL EDGE) never blanks the page.
 */
import { getDb } from "@/db";
import { load, type Loaded } from "@/lib/load";
import { playoffPicture, type PlayoffPicture } from "@/lib/magic";
import { nhl, txt, type ClubStats, type EdgeTeam, type ScheduleGame, type StandingsRow, type TeamSummaryRow } from "@/lib/nhl";
import { TEAM, TEAM_ID, previousSeason } from "@/lib/nhl/endpoints";
import { lastGame, liveGame, nextGame, ordinal, teamOf, teamView } from "@/lib/oilers";
import {
  METRICS,
  goalieTable,
  leagueTable,
  metricsOf,
  rollingShare,
  shooterTable,
  teamGames,
  teamRows,
  type MetricKey,
  type RankedTeam,
  type TeamGame,
} from "@/lib/stats/team";

/** Use this season once the Oilers have this many games stored; before that, last season. */
export const MIN_GAMES_FOR_SEASON = 5;

// ------------------------------------------------------------------ tiles

export type Trend = "better" | "worse" | "flat" | null;

export type Tile = {
  key: string;
  label: string;
  value: string;
  rank: number | null;
  of: number;
  trend: Trend;
  /** Last-10 value, shown with the trend arrow. */
  recent: string | null;
  explain: string;
};

type BasicRow = { teamId: number; gp: number; gfPg: number; gaPg: number; sfPg: number; saPg: number };

/** Goals and shots per game for every team (all situations), from stored games. */
function basicRows(season: number, gameIds?: number[]): BasicRow[] {
  const db = getDb().$client;
  const ids = gameIds ? ` AND id IN (${gameIds.map(Number).join(",") || "0"})` : "";
  const games = db
    .prepare(
      `SELECT team_id, COUNT(*) gp, SUM(gf) gf, SUM(ga) ga FROM (
         SELECT home_id team_id, home_score gf, away_score ga FROM stats_games WHERE season = ? AND game_type = 2${ids}
         UNION ALL SELECT away_id, away_score, home_score FROM stats_games WHERE season = ? AND game_type = 2${ids}
       ) GROUP BY team_id`,
    )
    .all(season, season) as { team_id: number; gp: number; gf: number; ga: number }[];
  const shotIds = gameIds ? ` AND game_id IN (${gameIds.map(Number).join(",") || "0"})` : "";
  const sf = new Map(
    (
      db
        .prepare(`SELECT team_id t, SUM(type IN ('shot-on-goal','goal')) n FROM shots WHERE season = ? AND game_type = 2${shotIds} GROUP BY team_id`)
        .all(season) as { t: number; n: number }[]
    ).map((r) => [r.t, r.n]),
  );
  const sa = new Map(
    (
      db
        .prepare(`SELECT opp_team_id t, SUM(type IN ('shot-on-goal','goal')) n FROM shots WHERE season = ? AND game_type = 2${shotIds} GROUP BY opp_team_id`)
        .all(season) as { t: number; n: number }[]
    ).map((r) => [r.t, r.n]),
  );
  return games.map((g) => ({
    teamId: g.team_id,
    gp: g.gp,
    gfPg: g.gf / g.gp,
    gaPg: g.ga / g.gp,
    sfPg: (sf.get(g.team_id) ?? 0) / g.gp,
    saPg: (sa.get(g.team_id) ?? 0) / g.gp,
  }));
}

/** Rank `value` among `values` (1 = best). */
export function rankOf(value: number, values: number[], higherIsBetter: boolean): number {
  return values.filter((v) => (higherIsBetter ? v > value + 1e-9 : v < value - 1e-9)).length + 1;
}

function trendOf(season: number, recent: number, higherIsBetter: boolean, threshold: number): Trend {
  const diff = recent - season;
  if (Math.abs(diff) < threshold) return "flat";
  return diff > 0 === higherIsBetter ? "better" : "worse";
}

const pct1 = (v: number) => `${v.toFixed(1)}%`;
const dec2 = (v: number) => v.toFixed(2);
const dec1 = (v: number) => v.toFixed(1);

// ------------------------------------------------------------------ main assembly

export type TapeRow = {
  key: string;
  label: string;
  us: { value: string; rank: number | null };
  them: { value: string; rank: number | null };
  of: number;
};

export type GoalieCard = { id: number; name: string; gp: number; svPct: number; gsax: number; xSvPct: number } | null;

export type HeatBin = { x: number; y: number; xg: number };
export type HeatMap = { bins: HeatBin[]; games: number; max: number };

export type HomeData = {
  season: number;
  currentSeason: number;
  /** Set when early-season numbers come from last season. */
  seasonNote: string | null;
  standings: Loaded<{ standings: StandingsRow[] }>;
  edm: StandingsRow | null;
  picture: PlayoffPicture | null;
  schedule: Loaded<{ games: ScheduleGame[]; currentSeason: number }>;
  next: ScheduleGame | null;
  last: ScheduleGame | null;
  basicTiles: Tile[];
  advancedTiles: Tile[];
  tape: TapeRow[] | null;
  opponent: { abbrev: string; id: number; name: string } | null;
  keys: string[];
  goalies: { us: GoalieCard; them: GoalieCard } | null;
  heat: { usFor: HeatMap; themFor: HeatMap; usAgainst: HeatMap; themAgainst: HeatMap } | null;
  form: { us: TeamGame[]; them: TeamGame[] };
  recent: TeamGame[];
  recentNote: string | null;
  trend: { gameId: number; date: string; value: number }[];
  leaders: {
    points: { id: number; name: string; points: number; goals: number; assists: number; gp: number }[];
    ixg: { id: number; name: string; ixg: number; goals: number; hd: number }[];
    goalies: { id: number; name: string; gp: number; svPct: number; gsax: number | null }[];
  };
  lastGameStats: { xgf: number; xga: number; hdcf: number; hdca: number; cfPct: number } | null;
  edge: Loaded<EdgeTeam>;
  updated: { stats: number | null };
  sources: { summary: Loaded<{ data: TeamSummaryRow[] }>; clubStats: Loaded<ClubStats> };
  /** Which season the leaders' points come from (falls back to this season if last season's isn't available). */
  leadersSeason: number;
};

/** Shots-on-target-weighted heat map bins (5 ft squares, offensive half, shooter attacking +x). */
function heatMap(teamId: number, season: number, side: "for" | "against"): HeatMap {
  const db = getDb().$client;
  const col = side === "for" ? "team_id" : "opp_team_id";
  const bins = db
    .prepare(
      `SELECT CAST((x - 25) / 5 AS INT) bx, CAST((y + 42.5) / 5 AS INT) by, SUM(xg) xg
       FROM shots WHERE ${col} = ? AND season = ? AND game_type = 2 AND type != 'blocked-shot' AND x >= 25 AND x <= 100 AND y IS NOT NULL
         AND strength != 'EN'
       GROUP BY bx, by`,
    )
    .all(teamId, season) as { bx: number; by: number; xg: number }[];
  const games = (db.prepare(`SELECT COUNT(*) n FROM stats_games WHERE season = ? AND game_type = 2 AND (home_id = ? OR away_id = ?)`).get(season, teamId, teamId) as { n: number }).n;
  const perGame = bins.map((b) => ({ x: 25 + b.bx * 5 + 2.5, y: -42.5 + b.by * 5 + 2.5, xg: games ? b.xg / games : 0 }));
  return { bins: perGame, games, max: Math.max(0.0001, ...perGame.map((b) => b.xg)) };
}

/** Likely starter: whoever faced the most shots in the team's most recent stored game. */
function likelyGoalie(teamId: number): number | null {
  const row = getDb()
    .$client.prepare(
      `SELECT s.goalie_id g, COUNT(*) n FROM shots s
       WHERE s.opp_team_id = ? AND s.goalie_id IS NOT NULL AND s.game_id = (
         SELECT id FROM stats_games WHERE home_id = ? OR away_id = ? ORDER BY game_date DESC, id DESC LIMIT 1)
       GROUP BY s.goalie_id ORDER BY n DESC LIMIT 1`,
    )
    .get(teamId, teamId, teamId) as { g: number } | undefined;
  return row?.g ?? null;
}

function gamesCount(teamId: number, season: number) {
  return (
    getDb()
      .$client.prepare(`SELECT COUNT(*) n FROM stats_games WHERE season = ? AND game_type = 2 AND (home_id = ? OR away_id = ?)`)
      .get(season, teamId, teamId) as { n: number }
  ).n;
}

/** The last `n` regular-season games, reaching back into the previous season if needed. */
function lastN(teamId: number, season: number, n: number): { games: TeamGame[]; spans: boolean } {
  const now = teamGames(teamId, season);
  if (now.length >= n) return { games: now.slice(-n), spans: false };
  const before = teamGames(teamId, previousSeason(season));
  const games = [...before, ...now].slice(-n);
  return { games, spans: games.some((g) => !now.includes(g)) };
}

async function playerName(id: number, clubStats?: ClubStats): Promise<string> {
  const s = clubStats?.skaters.find((p) => p.playerId === id) ?? clubStats?.goalies.find((p) => p.playerId === id);
  if (s) return `${txt(s.firstName)} ${txt(s.lastName)}`;
  const p = await load(() => nhl.player(id));
  return p.ok ? `${txt(p.data.firstName)} ${txt(p.data.lastName)}` : `Player ${id}`;
}

export async function homeData(): Promise<HomeData> {
  const [schedule, standings, clubStats, edge] = await Promise.all([
    load(nhl.schedule),
    load(nhl.standings),
    load(nhl.clubStats),
    load(() => nhl.edgeTeam(TEAM_ID)),
  ]);
  const currentSeason = schedule.ok ? schedule.data.currentSeason : 20262027;
  const enough = gamesCount(TEAM_ID, currentSeason) >= MIN_GAMES_FOR_SEASON;
  const season = enough ? currentSeason : previousSeason(currentSeason);
  const seasonNote = enough
    ? null
    : `Early in the season: team stats and ranks are from 2025-26 until the Oilers have played ${MIN_GAMES_FOR_SEASON} games.`;
  const [summary, seasonStats] = await Promise.all([
    load(() => nhl.teamSummary(season)),
    season === currentSeason ? Promise.resolve(clubStats) : load(() => nhl.clubStatsSeason(season)),
  ]);

  const games = schedule.ok ? schedule.data.games : [];
  const next = liveGame(games) ?? nextGame(games) ?? null;
  const last = lastGame(games) ?? null;
  const rows = standings.ok ? standings.data.standings : [];
  const edm = rows.find((r) => teamOf(r) === TEAM) ?? null;

  // League tables for the analysis season.
  const table = leagueTable(season);
  const tableById = new Map(table.map((t) => [t.teamId, t]));
  const basics = basicRows(season);
  const basicsById = new Map(basics.map((b) => [b.teamId, b]));
  const goalies = goalieTable(season);
  const teamGsax = new Map<number, number>();
  for (const g of goalies) teamGsax.set(g.teamId, (teamGsax.get(g.teamId) ?? 0) + g.gsax);
  const summaryRows = summary.ok ? summary.data.data : [];
  const summaryById = new Map(summaryRows.map((r) => [r.teamId, r]));

  // Last 10 games for trends.
  const recentGames = teamGames(TEAM_ID, season).slice(-10);
  const recentIds = recentGames.map((g) => g.gameId);
  const recentAdv = teamRows({ season, gameIds: recentIds }).find((r) => r.teamId === TEAM_ID);
  const recentMetrics = recentAdv ? metricsOf(recentAdv) : null;
  const recentBasic = basicRows(season, recentIds).find((r) => r.teamId === TEAM_ID);

  const us = tableById.get(TEAM_ID);
  const usBasic = basicsById.get(TEAM_ID);
  const usSummary = summaryById.get(TEAM_ID);

  const basicTile = (key: keyof Omit<BasicRow, "teamId" | "gp">, label: string, higher: boolean, explain: string): Tile => {
    const v = usBasic?.[key];
    const r = recentBasic?.[key];
    return {
      key,
      label,
      value: v === undefined ? "—" : dec2(v),
      rank: v === undefined ? null : rankOf(v, basics.map((b) => b[key]), higher),
      of: basics.length,
      trend: v === undefined || r === undefined || recentIds.length < 3 ? null : trendOf(v, r, higher, key.startsWith("s") ? 1.5 : 0.25),
      recent: r === undefined || recentIds.length < 3 ? null : dec2(r),
      explain,
    };
  };
  const summaryTile = (key: "powerPlayPct" | "penaltyKillPct" | "faceoffWinPct", label: string, explain: string): Tile => {
    const v = usSummary?.[key];
    const all = summaryRows.map((r) => r[key]).filter((x): x is number => typeof x === "number");
    return {
      key,
      label,
      value: typeof v === "number" ? pct1(v * 100) : "—",
      rank: typeof v === "number" ? rankOf(v, all, true) : null,
      of: all.length,
      trend: null,
      recent: null,
      explain,
    };
  };
  const advTile = (key: MetricKey): Tile => {
    const m = METRICS[key];
    const v = us?.metrics[key];
    const r = recentMetrics?.[key];
    const fmt = m.format === "pct" ? pct1 : m.format === "pdo" ? dec1 : dec2;
    return {
      key,
      label: m.label,
      value: v === undefined ? "—" : fmt(v),
      rank: us ? us.ranks[key] : null,
      of: table.length,
      trend: v === undefined || r === undefined || recentIds.length < 3 ? null : trendOf(v, r, m.higherIsBetter, m.format === "rate" ? 0.15 : 1),
      recent: r === undefined || recentIds.length < 3 ? null : fmt(r),
      explain: m.explain,
    };
  };

  const gsaxValues = table.map((t) => teamGsax.get(t.teamId) ?? 0);
  const usGsax = teamGsax.get(TEAM_ID);

  const basicTiles: Tile[] = [
    basicTile("gfPg", "Goals for per game", true, "Average goals scored per game, all situations."),
    basicTile("gaPg", "Goals against per game", false, "Average goals allowed per game. Lower is better."),
    basicTile("sfPg", "Shots for per game", true, "Shots on goal per game."),
    basicTile("saPg", "Shots against per game", false, "Shots on goal allowed per game. Lower is better."),
    summaryTile("powerPlayPct", "Power play", "Share of power plays that produce a goal."),
    summaryTile("penaltyKillPct", "Penalty kill", "Share of opponent power plays killed without a goal."),
    summaryTile("faceoffWinPct", "Faceoffs", "Share of faceoffs won."),
  ];
  const advancedTiles: Tile[] = [
    advTile("xgfPct"),
    advTile("cfPct"),
    advTile("hdcfPct"),
    advTile("pdo"),
    {
      key: "gsax",
      label: "Goaltending: goals saved above expected",
      value: usGsax === undefined ? "—" : `${usGsax >= 0 ? "+" : ""}${dec1(usGsax)}`,
      rank: usGsax === undefined ? null : rankOf(usGsax, gsaxValues, true),
      of: table.length,
      trend: null,
      recent: null,
      explain: "Goals the team's goalies stopped beyond what an average goalie would, given the shots they faced. Above zero is good.",
    },
  ];

  // ------------------------------------------------ next game
  let tape: TapeRow[] | null = null;
  let opponent: HomeData["opponent"] = null;
  let keys: string[] = [];
  let goalieCards: HomeData["goalies"] = null;
  let heat: HomeData["heat"] = null;
  let form: HomeData["form"] = { us: [], them: [] };
  if (next) {
    const v = teamView(next);
    opponent = { abbrev: v.opp.abbrev, id: v.opp.id, name: `${txt(v.opp.placeName)} ${txt(v.opp.commonName, v.opp.abbrev)}`.trim() };
    const them = tableById.get(v.opp.id);
    const themBasic = basicsById.get(v.opp.id);
    const themSummary = summaryById.get(v.opp.id);
    const oppEdge = await load(() => nhl.edgeTeam(v.opp.id));

    const advRow = (key: MetricKey): TapeRow => {
      const m = METRICS[key];
      const fmt = m.format === "pct" ? pct1 : m.format === "pdo" ? dec1 : dec2;
      return {
        key,
        label: m.label.replace(/ \(.*\)$/, ""),
        us: { value: us ? fmt(us.metrics[key]) : "—", rank: us?.ranks[key] ?? null },
        them: { value: them ? fmt(them.metrics[key]) : "—", rank: them?.ranks[key] ?? null },
        of: table.length,
      };
    };
    const basicRow = (key: "gfPg" | "gaPg", label: string, higher: boolean): TapeRow => ({
      key,
      label,
      us: { value: usBasic ? dec2(usBasic[key]) : "—", rank: usBasic ? rankOf(usBasic[key], basics.map((b) => b[key]), higher) : null },
      them: { value: themBasic ? dec2(themBasic[key]) : "—", rank: themBasic ? rankOf(themBasic[key], basics.map((b) => b[key]), higher) : null },
      of: basics.length,
    });
    const sumRow = (key: "powerPlayPct" | "penaltyKillPct", label: string): TapeRow => {
      const all = summaryRows.map((r) => r[key]).filter((x): x is number => typeof x === "number");
      const val = (r?: TeamSummaryRow) => (typeof r?.[key] === "number" ? (r[key] as number) : null);
      const a = val(usSummary);
      const b = val(themSummary);
      return {
        key,
        label,
        us: { value: a === null ? "—" : pct1(a * 100), rank: a === null ? null : rankOf(a, all, true) },
        them: { value: b === null ? "—" : pct1(b * 100), rank: b === null ? null : rankOf(b, all, true) },
        of: all.length,
      };
    };
    const edgeRow = (label: string, pick: (e: EdgeTeam) => { v?: number | null; rank?: number | null }, unit: string): TapeRow => {
      const a = edge.ok ? pick(edge.data) : {};
      const b = oppEdge.ok ? pick(oppEdge.data) : {};
      const f = (x?: number | null) => (typeof x === "number" ? `${x.toFixed(1)} ${unit}` : "—");
      return { key: label, label, us: { value: f(a.v), rank: a.rank ?? null }, them: { value: f(b.v), rank: b.rank ?? null }, of: 32 };
    };
    tape = [
      advRow("xgfPct"),
      advRow("cfPct"),
      advRow("hdcfPct"),
      basicRow("gfPg", "Goals for per game", true),
      basicRow("gaPg", "Goals against per game", false),
      sumRow("powerPlayPct", "Power play"),
      sumRow("penaltyKillPct", "Penalty kill"),
      edgeRow("Top skating speed", (e) => ({ v: e.skatingSpeed?.speedMax?.imperial, rank: e.skatingSpeed?.speedMax?.rank }), "mph"),
      edgeRow("Hardest shot", (e) => ({ v: e.shotSpeed?.topShotSpeed?.imperial, rank: e.shotSpeed?.topShotSpeed?.rank }), "mph"),
    ];
    keys = keysToTheGame(tape, opponent.abbrev);

    const usG = likelyGoalie(TEAM_ID);
    const themG = likelyGoalie(v.opp.id);
    const card = async (id: number | null, teamId: number): Promise<GoalieCard> => {
      if (!id) return null;
      const g = goalies.find((x) => x.goalieId === id && x.teamId === teamId) ?? goalies.find((x) => x.goalieId === id);
      const gp = (
        getDb()
          .$client.prepare(`SELECT COUNT(DISTINCT game_id) n FROM shots WHERE goalie_id = ? AND season = ? AND game_type = 2`)
          .get(id, season) as { n: number }
      ).n;
      return {
        id,
        name: await playerName(id, teamId === TEAM_ID ? (seasonStats.ok ? seasonStats.data : clubStats.ok ? clubStats.data : undefined) : undefined),
        gp,
        svPct: g?.svPct ?? 0,
        gsax: g?.gsax ?? 0,
        xSvPct: g?.xSvPct ?? 0,
      };
    };
    goalieCards = { us: await card(usG, TEAM_ID), them: await card(themG, v.opp.id) };
    heat = {
      usFor: heatMap(TEAM_ID, season, "for"),
      themFor: heatMap(v.opp.id, season, "for"),
      usAgainst: heatMap(TEAM_ID, season, "against"),
      themAgainst: heatMap(v.opp.id, season, "against"),
    };
    form = { us: lastN(TEAM_ID, currentSeason, 10).games, them: lastN(v.opp.id, currentSeason, 10).games };
  }

  // ------------------------------------------------ recent performance
  const recent = lastN(TEAM_ID, currentSeason, 10);
  const trendGames = teamGames(TEAM_ID, season);

  // ------------------------------------------------ leaders
  const cs = seasonStats.ok ? seasonStats.data : clubStats.ok ? clubStats.data : undefined;
  const leadersSeason = seasonStats.ok ? season : currentSeason;
  const leaderGsax = new Map<number, number>();
  for (const g of goalieTable(leadersSeason)) {
    if (g.teamId === TEAM_ID) leaderGsax.set(g.goalieId, (leaderGsax.get(g.goalieId) ?? 0) + g.gsax);
  }
  const leaders: HomeData["leaders"] = {
    points: cs
      ? [...cs.skaters]
          .filter((p) => p.gamesPlayed > 0)
          .sort((a, b) => b.points - a.points || b.goals - a.goals)
          .slice(0, 5)
          .map((p) => ({ id: p.playerId, name: `${txt(p.firstName)} ${txt(p.lastName)}`, points: p.points, goals: p.goals, assists: p.assists, gp: p.gamesPlayed }))
      : [],
    ixg: await Promise.all(
      shooterTable(TEAM_ID, season)
        .slice(0, 5)
        .map(async (s) => ({ id: s.playerId, name: await playerName(s.playerId, cs), ixg: s.ixg, goals: s.goals, hd: s.hdChances })),
    ),
    goalies: cs
      ? cs.goalies
          .filter((g) => g.gamesPlayed > 0)
          .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
          .map((g) => ({
            id: g.playerId,
            name: `${txt(g.firstName)} ${txt(g.lastName)}`,
            gp: g.gamesPlayed,
            svPct: g.savePercentage,
            gsax: leaderGsax.get(g.playerId) ?? null,
          }))
      : [],
  };

  // ------------------------------------------------ last game
  let lastGameStats: HomeData["lastGameStats"] = null;
  if (last) {
    const g = teamGames(TEAM_ID, last.season).find((x) => x.gameId === last.id);
    if (g) {
      lastGameStats = {
        xgf: g.xgf,
        xga: g.xga,
        hdcf: g.hdcf,
        hdca: g.hdca,
        cfPct: g.cf5 + g.ca5 ? (g.cf5 / (g.cf5 + g.ca5)) * 100 : 50,
      };
    }
  }

  const statsUpdated = (getDb().$client.prepare(`SELECT MAX(ingested_at) t FROM stats_games`).get() as { t: number | null }).t;

  return {
    season,
    currentSeason,
    seasonNote,
    standings,
    edm,
    picture: rows.length ? playoffPicture(rows, TEAM) : null,
    schedule,
    next,
    last,
    basicTiles,
    advancedTiles,
    tape,
    opponent,
    keys,
    goalies: goalieCards,
    heat,
    form,
    recent: recent.games,
    recentNote: recent.spans ? "Includes games from last season." : null,
    trend: rollingShare(trendGames, "xgf5", "xga5", 5),
    leaders,
    lastGameStats,
    edge,
    updated: { stats: statsUpdated },
    sources: { summary, clubStats },
    leadersSeason,
  };
}

/**
 * Two or three plain-language lines from the biggest rank gaps in the tale of the tape.
 * Ranks only count when both teams have one.
 */
export function keysToTheGame(tape: TapeRow[], opp: string): string[] {
  const gaps = tape
    .filter((r) => r.us.rank !== null && r.them.rank !== null)
    .map((r) => ({ r, gap: (r.them.rank as number) - (r.us.rank as number) }))
    .filter((x) => Math.abs(x.gap) >= 6)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const lines: string[] = [];
  const usEdge = gaps.find((x) => x.gap > 0);
  const themEdge = gaps.find((x) => x.gap < 0);
  for (const x of [usEdge, themEdge, ...gaps.filter((g) => g !== usEdge && g !== themEdge)]) {
    if (!x || lines.length >= 3) continue;
    const label = x.r.label.toLowerCase();
    lines.push(
      x.gap > 0
        ? `Edge Edmonton: ${label}, ${ordinal(x.r.us.rank!)} in the league vs ${opp}'s ${ordinal(x.r.them.rank!)}.`
        : `Watch for: ${opp}'s ${label} ranks ${ordinal(x.r.them.rank!)}; Edmonton's is ${ordinal(x.r.us.rank!)}.`,
    );
  }
  return lines;
}

export type { RankedTeam };
