/**
 * Everything the home page shows, assembled on the server. Each part loads independently, so
 * one failing source (say NHL EDGE) never blanks the page.
 */
import { getDb } from "@/db";
import { burstTable, rosterEdge, type BurstTable, type SkaterEdgeRow } from "@/lib/edge";
import { rankOf } from "@/lib/rank";
import { RANKS_PENDING_NOTE, ranksReady } from "@/lib/tone";
import { builtPlayerIds, playerHref } from "@/lib/site";
import { load, type Loaded } from "@/lib/load";
import { SEASON_GAMES, playoffPicture, type PlayoffPicture } from "@/lib/magic";
import { latestOdds, oddsHistory } from "@/lib/stats/odds";
import { nhl, txt, type ClubStats, type EdgeTeam, type ScheduleGame, type StandingsRow, type TeamSummaryRow } from "@/lib/nhl";
import { TEAM, TEAM_ID } from "@/lib/nhl/endpoints";
import { lastGame, liveGame, nextGame, ordinal, teamOf, teamView } from "@/lib/oilers";
import { analyzeGame, type GameReport } from "@/lib/stats/game";
import { clutchSummary, clutchTable, hasGoalData } from "@/lib/stats/clutch";
import { hotAndCold, shootingData, type Shooter } from "@/lib/shooting";
import { gameRatings, ratingLeaders, topGameScores } from "@/lib/stats/onice";
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

/** Below this many games, the page reminds readers that the sample is small. */
export const SMALL_SAMPLE_GAMES = 10;

/** A plain-language note on how far into the season the numbers are, or null once it's meaningful. */
export function sampleNote(gp: number): string | null {
  if (gp === 0) return "No games played yet this season. Numbers fill in after opening night.";
  if (gp < SMALL_SAMPLE_GAMES) return `Only ${gp} game${gp === 1 ? "" : "s"} into the season, so these numbers will move a lot.`;
  return null;
}

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

export type BasicRow = { teamId: number; gp: number; gfPg: number; gaPg: number; sfPg: number; saPg: number };

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

export { rankOf } from "@/lib/rank";

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

/** A goalie on the team's roster with this season's numbers (null stats = no games yet). */
export type GoalieCard = { id: number; name: string; href: string; number?: number; gp: number; svPct: number | null; gsax: number | null; xSvPct: number | null };

export type HeatBin = { x: number; y: number; xg: number };
/** `bins` hold expected goals per game above the league average; `vsLeague` is the overall difference (0.08 = 8% more). */
export type HeatMap = { bins: HeatBin[]; games: number; max: number; vsLeague: number };

export type HomeData = {
  season: number;
  currentSeason: number;
  /** Set while the season is only a few games old. */
  seasonNote: string | null;
  /** Set until every team has played, while league ranks are hidden. */
  ranksNote: string | null;
  standings: Loaded<{ standings: StandingsRow[] }>;
  edm: StandingsRow | null;
  picture: PlayoffPicture | null;
  /** Simulated playoff odds (0–1) from the last update, and their history this season. */
  odds: { odds: number; projPoints: number; runAt: number; history: { date: string; gp: number; odds: number }[] } | null;
  schedule: Loaded<{ games: ScheduleGame[]; currentSeason: number }>;
  next: ScheduleGame | null;
  last: ScheduleGame | null;
  basicTiles: Tile[];
  advancedTiles: Tile[];
  tape: TapeRow[] | null;
  opponent: { abbrev: string; id: number; name: string } | null;
  keys: string[];
  goalies: { us: GoalieCard[]; them: GoalieCard[] } | null;
  heat: { usFor: HeatMap; themFor: HeatMap; usAgainst: HeatMap; themAgainst: HeatMap } | null;
  form: { us: TeamGame[]; them: TeamGame[] };
  recent: TeamGame[];
  /** The best single-game Oilers performances of the last five games. */
  topRecent: { id: number; name: string; gameId: number; date: string; opponent: string; isHome: boolean; rating: number; gameScore: number; line: string }[];
  trend: { gameId: number; date: string; value: number }[];
  leaders: {
    points: { id: number; name: string; points: number; goals: number; assists: number; gp: number }[];
    goals: { id: number; name: string; goals: number; shots: number; gp: number }[];
    assists: { id: number; name: string; assists: number; points: number; gp: number }[];
    /** Best average rating this season (skaters who've played at least `minGames`). */
    rating: { minGames: number; rows: { id: number; name: string; avgRating: number; gp: number }[] };
    ixg: { id: number; name: string; ixg: number; goals: number; hd: number }[];
    goalies: { id: number; name: string; gp: number; svPct: number; gsax: number | null }[];
  };
  /** The Oilers' top three in Clutch Score, with their league rank (`ready` is false until goals are stored). */
  clutch: { ready: boolean; leaguePlayers: number; rows: { id: number; name: string; score: number; rank: number; summary: string }[] };
  /** The three Oilers furthest above and below their career shooting %. */
  shooting: { hot: Shooter[]; cold: Shooter[]; note: string | null };
  /** The most recent finished game, analysed from its play-by-play. */
  lastReport: GameReport | null;
  /** The best three Oilers ratings in that game (empty until its shift charts are stored). */
  lastRatings: { id: number; name: string; pos: string; rating: number; gameScore: number }[];
  edge: Loaded<EdgeTeam>;
  /** Speed bursts per game, ranked by us across the league. */
  bursts: BurstTable;
  /** Every Oilers skater's EDGE numbers this season. */
  rosterEdge: SkaterEdgeRow[];
  updated: { stats: number | null };
  sources: { summary: Loaded<{ data: TeamSummaryRow[] }>; clubStats: Loaded<ClubStats> };
};

const NX = 15; // 5 ft columns from the blue line (x 25) to the end boards
const NY = 17; // 5 ft rows across the ice

function heatGrid(where: string, args: (number | string)[]): number[][] {
  const grid = Array.from({ length: NX }, () => Array<number>(NY).fill(0));
  const rows = getDb()
    .$client.prepare(
      `SELECT CAST((x - 25) / 5 AS INT) bx, CAST((y + 42.5) / 5 AS INT) by, SUM(xg) xg
       FROM shots WHERE ${where} AND game_type = 2 AND type != 'blocked-shot' AND x >= 25 AND x < 100 AND y IS NOT NULL
         AND strength != 'EN'
       GROUP BY bx, by`,
    )
    .all(...args) as { bx: number; by: number; xg: number }[];
  for (const r of rows) if (r.bx >= 0 && r.bx < NX && r.by >= 0 && r.by < NY) grid[r.bx][r.by] += r.xg;
  return grid;
}

/** Light 3×3 smoothing so one lucky bounce doesn't paint a hot square. */
function smooth(g: number[][]): number[][] {
  const w = [
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1],
  ];
  return g.map((col, i) =>
    col.map((_, j) => {
      let sum = 0;
      let wt = 0;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          const v = g[i + di]?.[j + dj];
          if (v === undefined) continue;
          sum += v * w[di + 1][dj + 1];
          wt += w[di + 1][dj + 1];
        }
      return sum / wt;
    }),
  );
}

const leagueHeatCache = new Map<number, { grid: number[][]; total: number; at: number }>();

/** League-average expected goals per team-game in each 5 ft square. */
function leagueHeat(season: number) {
  const hit = leagueHeatCache.get(season);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit;
  const teamGames = 2 * (getDb().$client.prepare(`SELECT COUNT(*) n FROM stats_games WHERE season = ? AND game_type = 2`).get(season) as { n: number }).n;
  const raw = heatGrid("season = ?", [season]);
  const grid = smooth(raw).map((col) => col.map((v) => (teamGames ? v / teamGames : 0)));
  const total = raw.flat().reduce((a, b) => a + b, 0) / Math.max(1, teamGames);
  const out = { grid, total, at: Date.now() };
  leagueHeatCache.set(season, out);
  return out;
}

/**
 * Where a team's chances (for or against) come from compared with the league average: each
 * 5 ft square shows how many more expected goals per game it sees there than an average team.
 * Squares at or below average stay blank, so the map highlights what's unusual about the team.
 */
export function heatMap(teamId: number, season: number, side: "for" | "against"): HeatMap {
  const col = side === "for" ? "team_id" : "opp_team_id";
  const games = gamesCount(teamId, season);
  const league = leagueHeat(season);
  const raw = heatGrid(`${col} = ? AND season = ?`, [teamId, season]);
  const team = smooth(raw).map((c) => c.map((v) => (games ? v / games : 0)));
  const bins: HeatBin[] = [];
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NY; j++) {
      const excess = team[i][j] - league.grid[i][j];
      if (excess > 0) bins.push({ x: 25 + i * 5 + 2.5, y: -42.5 + j * 5 + 2.5, xg: excess });
    }
  const perGame = games ? raw.flat().reduce((a, b) => a + b, 0) / games : 0;
  return {
    bins,
    games,
    max: Math.max(0.0001, ...bins.map((b) => b.xg)),
    vsLeague: league.total ? perGame / league.total - 1 : 0,
  };
}

/** Every goalie on a team's roster with this season's numbers; falls back to goalies who've played if the roster can't load. */
export async function teamGoalies(abbrev: string, teamId: number, season: number): Promise<GoalieCard[]> {
  const db = getDb().$client;
  const stats = new Map(goalieTable(season).filter((g) => g.teamId === teamId).map((g) => [g.goalieId, g]));
  const gpOf = (id: number) =>
    (db.prepare(`SELECT COUNT(DISTINCT game_id) n FROM shots WHERE goalie_id = ? AND opp_team_id = ? AND season = ? AND game_type = 2`).get(id, teamId, season) as { n: number }).n;
  const roster = await load(() => nhl.roster(abbrev));
  const people: { id: number; name: string; number?: number }[] = roster.ok
    ? roster.data.goalies.map((g) => ({ id: g.id, name: `${txt(g.firstName)} ${txt(g.lastName)}`, number: g.sweaterNumber }))
    : await Promise.all([...stats.keys()].map(async (id) => ({ id, name: await playerName(id) })));
  const built = await builtPlayerIds();
  return people
    .map((p) => {
      const g = stats.get(p.id);
      return { ...p, href: playerHref(p.id, built), gp: gpOf(p.id), svPct: g ? g.svPct : null, gsax: g ? g.gsax : null, xSvPct: g ? g.xSvPct : null };
    })
    .sort((a, b) => b.gp - a.gp || a.name.localeCompare(b.name));
}

export function gamesCount(teamId: number, season: number) {
  return (
    getDb()
      .$client.prepare(`SELECT COUNT(*) n FROM stats_games WHERE season = ? AND game_type = 2 AND (home_id = ? OR away_id = ?)`)
      .get(season, teamId, teamId) as { n: number }
  ).n;
}

/** The last `n` regular-season games of this season. */
export function lastN(teamId: number, season: number, n: number): TeamGame[] {
  return teamGames(teamId, season).slice(-n);
}

export async function playerName(id: number, clubStats?: ClubStats): Promise<string> {
  const s = clubStats?.skaters.find((p) => p.playerId === id) ?? clubStats?.goalies.find((p) => p.playerId === id);
  if (s) return `${txt(s.firstName)} ${txt(s.lastName)}`;
  const p = await load(() => nhl.player(id));
  return p.ok ? `${txt(p.data.firstName)} ${txt(p.data.lastName)}` : `Player ${id}`;
}

/** League-wide numbers that every team's ranks are measured against, for one season. */
export type LeagueContext = {
  table: RankedTeam[];
  tableById: Map<number, RankedTeam>;
  basics: BasicRow[];
  basicsById: Map<number, BasicRow>;
  goalies: ReturnType<typeof goalieTable>;
  /** Goals saved above expected, summed over each team's goalies. */
  teamGsax: Map<number, number>;
  /** Save % on shots on goal (all situations; empty-net goals not counted), per team. */
  teamSvPct: Map<number, number>;
  summary: Loaded<{ data: TeamSummaryRow[] }>;
  summaryRows: TeamSummaryRow[];
  summaryById: Map<number, TeamSummaryRow>;
  /** False until every team in the league has a game stored: until then ranks are hidden. */
  ranksReady: boolean;
};

const contextCache = new Map<number, { at: number; value: Promise<LeagueContext> }>();

/** Built once and shared for a few minutes, so 32 team pages don't redo the league-wide maths. */
export function leagueContext(season: number): Promise<LeagueContext> {
  const hit = contextCache.get(season);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const value = (async () => {
    const [summary, standings] = await Promise.all([load(() => nhl.teamSummary(season)), load(nhl.standings)]);
    const table = leagueTable(season);
    const basics = basicRows(season);
    const goalies = goalieTable(season);
    const teamGsax = new Map<number, number>();
    for (const g of goalies) teamGsax.set(g.teamId, (teamGsax.get(g.teamId) ?? 0) + g.gsax);
    // Every goalie's shots on goal faced and goals allowed, added up per team.
    const saves = new Map<number, { shots: number; goals: number }>();
    for (const g of goalies) {
      const t = saves.get(g.teamId) ?? { shots: 0, goals: 0 };
      t.shots += g.shotsFaced;
      t.goals += g.goalsAllowed;
      saves.set(g.teamId, t);
    }
    const teamSvPct = new Map([...saves].filter(([, t]) => t.shots > 0).map(([id, t]) => [id, 1 - t.goals / t.shots]));
    const summaryRows = summary.ok ? summary.data.data : [];
    return {
      table,
      tableById: new Map(table.map((t) => [t.teamId, t])),
      basics,
      basicsById: new Map(basics.map((b) => [b.teamId, b])),
      goalies,
      teamGsax,
      teamSvPct,
      summary,
      summaryRows,
      summaryById: new Map(summaryRows.map((r) => [r.teamId, r])),
      ranksReady: ranksReady(table.length, standings.ok ? standings.data.standings.length : table.length),
    };
  })();
  contextCache.set(season, { at: Date.now(), value });
  return value;
}

/** A team's basic and advanced stat tiles, with league ranks and last-10 trends. */
export function statTiles(teamId: number, season: number, lg: LeagueContext): { basicTiles: Tile[]; advancedTiles: Tile[]; pdoTiles: Tile[] } {
  const { table, basics, summaryRows, teamGsax } = lg;

  // Last 10 games for trends.
  const recentGames = teamGames(teamId, season).slice(-10);
  const recentIds = recentGames.map((g) => g.gameId);
  const recentAdv = teamRows({ season, gameIds: recentIds }).find((r) => r.teamId === teamId);
  const recentMetrics = recentAdv ? metricsOf(recentAdv) : null;
  const recentBasic = basicRows(season, recentIds).find((r) => r.teamId === teamId);

  const us = lg.tableById.get(teamId);
  const usBasic = lg.basicsById.get(teamId);
  const usSummary = lg.summaryById.get(teamId);

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

  const saveTile = (): Tile => {
    const v = lg.teamSvPct.get(teamId);
    const all = [...lg.teamSvPct.values()];
    return {
      key: "svPct",
      label: "Save percentage",
      value: v === undefined ? "—" : v.toFixed(3).replace(/^0/, ""),
      rank: v === undefined ? null : rankOf(v, all, true),
      of: all.length,
      trend: null,
      recent: null,
      explain: "Share of shots on goal the team's goalies stopped, all situations. Empty-net goals don't count against it.",
    };
  };

  const gsaxValues = table.map((t) => teamGsax.get(t.teamId) ?? 0);
  const usGsax = teamGsax.get(teamId);

  const basicTiles: Tile[] = [
    basicTile("gfPg", "Goals for per game", true, "Average goals scored per game, all situations."),
    basicTile("gaPg", "Goals against per game", false, "Average goals allowed per game. Lower is better."),
    basicTile("sfPg", "Shots for per game", true, "Shots on goal per game."),
    basicTile("saPg", "Shots against per game", false, "Shots on goal allowed per game. Lower is better."),
    summaryTile("powerPlayPct", "Power play", "Share of power plays that produce a goal."),
    summaryTile("penaltyKillPct", "Penalty kill", "Share of opponent power plays killed without a goal."),
    summaryTile("faceoffWinPct", "Faceoffs", "Share of faceoffs won."),
    saveTile(),
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
  // The two halves of PDO, for the Season In-Depth page.
  const pdoTiles: Tile[] = [advTile("sh5Pct"), advTile("sv5Pct")];
  if (lg.ranksReady) return { basicTiles, advancedTiles, pdoTiles };
  const noRank = (t: Tile): Tile => ({ ...t, rank: null });
  return { basicTiles: basicTiles.map(noRank), advancedTiles: advancedTiles.map(noRank), pdoTiles: pdoTiles.map(noRank) };
}

export async function homeData(): Promise<HomeData> {
  const [schedule, standings, clubStats, edge] = await Promise.all([
    load(nhl.schedule),
    load(nhl.standings),
    load(nhl.clubStats),
    load(() => nhl.edgeTeam(TEAM_ID)),
  ]);
  const currentSeason = schedule.ok ? schedule.data.currentSeason : 20262027;
  // Everything uses this season only: the roster turns over too much for last season to mean much.
  const season = currentSeason;
  const seasonNote = sampleNote(gamesCount(TEAM_ID, season));
  const [lg, bursts, skaterEdge] = await Promise.all([
    leagueContext(season),
    burstTable(standings.ok ? standings.data.standings : [], season),
    rosterEdge(season),
  ]);
  const { table, tableById, basics, basicsById, goalies, summary, summaryRows, summaryById } = lg;

  const games = schedule.ok ? schedule.data.games : [];
  const next = liveGame(games) ?? nextGame(games) ?? null;
  const last = lastGame(games) ?? null;
  const rows = standings.ok ? standings.data.standings : [];
  const edm = rows.find((r) => teamOf(r) === TEAM) ?? null;

  const us = tableById.get(TEAM_ID);
  const usBasic = basicsById.get(TEAM_ID);
  const usSummary = summaryById.get(TEAM_ID);
  const { basicTiles, advancedTiles } = statTiles(TEAM_ID, season, lg);

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
    const edgeRow = (label: string, pick: (e: EdgeTeam, gp: number) => { v?: number | null; rank?: number | null }, fmt: (x: number) => string): TapeRow => {
      const gpOf = (abbrev: string) => rows.find((r) => teamOf(r) === abbrev)?.gamesPlayed ?? 0;
      const a = edge.ok ? pick(edge.data, gpOf(TEAM)) : {};
      const b = oppEdge.ok ? pick(oppEdge.data, gpOf(v.opp.abbrev)) : {};
      const f = (x?: number | null) => (typeof x === "number" && Number.isFinite(x) ? fmt(x) : "—");
      return { key: label, label, us: { value: f(a.v), rank: a.rank ?? null }, them: { value: f(b.v), rank: b.rank ?? null }, of: 32 };
    };
    // Pace of play: 5-on-5 shot attempts per 60 by both teams in that team's games. Rank 1 = fastest.
    const pace = (t?: RankedTeam) => (t ? t.metrics.cf60 + t.metrics.ca60 : null);
    const paces = table.map((t) => t.metrics.cf60 + t.metrics.ca60);
    const paceRow = (): TapeRow => {
      const a = pace(us);
      const b = pace(them);
      return {
        key: "pace",
        label: "Pace of play",
        us: { value: a === null ? "—" : a.toFixed(1), rank: a === null ? null : rankOf(a, paces, true) },
        them: { value: b === null ? "—" : b.toFixed(1), rank: b === null ? null : rankOf(b, paces, true) },
        of: table.length,
      };
    };
    tape = [
      advRow("xgfPct"),
      advRow("cfPct"),
      advRow("hdcfPct"),
      basicRow("gfPg", "Goals for per game", true),
      basicRow("gaPg", "Goals against per game", false),
      sumRow("powerPlayPct", "Power play"),
      sumRow("penaltyKillPct", "Penalty kill"),
      paceRow(),
      (() => {
        const a = bursts.over20.get(TEAM);
        const b = bursts.over20.get(v.opp.abbrev);
        const f = (x?: number | null) => (typeof x === "number" ? x.toFixed(1) : "—");
        return {
          key: "bursts",
          label: "Speed bursts per game",
          us: { value: f(a?.value), rank: a?.rank ?? null },
          them: { value: f(b?.value), rank: b?.rank ?? null },
          of: a?.of ?? b?.of ?? 0,
        };
      })(),
      edgeRow(
        "Offensive-zone time",
        (e) => ({ v: typeof e.zoneTimeDetails?.offensiveZonePctg === "number" ? e.zoneTimeDetails.offensiveZonePctg * 100 : null, rank: (e.zoneTimeDetails as { offensiveZoneRank?: number } | undefined)?.offensiveZoneRank }),
        (x) => `${x.toFixed(1)}%`,
      ),
    ];
    if (!lg.ranksReady) tape = tape.map((r) => ({ ...r, us: { ...r.us, rank: null }, them: { ...r.them, rank: null } }));
    keys = keysToTheGame(tape, opponent.abbrev);

    goalieCards = { us: await teamGoalies(TEAM, TEAM_ID, season), them: await teamGoalies(v.opp.abbrev, v.opp.id, season) };
    heat = {
      usFor: heatMap(TEAM_ID, season, "for"),
      themFor: heatMap(v.opp.id, season, "for"),
      usAgainst: heatMap(TEAM_ID, season, "against"),
      themAgainst: heatMap(v.opp.id, season, "against"),
    };
    form = { us: lastN(TEAM_ID, season, 10), them: lastN(v.opp.id, season, 10) };
  }

  // ------------------------------------------------ recent performance
  const recent = lastN(TEAM_ID, season, 10);
  const trendGames = teamGames(TEAM_ID, season);

  // ------------------------------------------------ leaders
  const league = clutchTable(season);
  const clutch: HomeData["clutch"] = {
    ready: hasGoalData(season),
    leaguePlayers: league.length,
    rows: league
      .filter((r) => r.teamId === TEAM_ID)
      .slice(0, 3)
      .map((r) => ({ id: r.playerId, name: r.name, score: r.score, rank: r.rank, summary: clutchSummary(r) })),
  };
  const cs = clubStats.ok ? clubStats.data : undefined;
  const leaderGsax = new Map<number, number>();
  for (const g of goalies) {
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
    goals: cs
      ? [...cs.skaters]
          .filter((p) => p.goals > 0)
          .sort((a, b) => b.goals - a.goals || a.gamesPlayed - b.gamesPlayed)
          .slice(0, 5)
          .map((p) => ({ id: p.playerId, name: `${txt(p.firstName)} ${txt(p.lastName)}`, goals: p.goals, shots: p.shots, gp: p.gamesPlayed }))
      : [],
    assists: cs
      ? [...cs.skaters]
          .filter((p) => p.assists > 0)
          .sort((a, b) => b.assists - a.assists || b.points - a.points)
          .slice(0, 5)
          .map((p) => ({ id: p.playerId, name: `${txt(p.firstName)} ${txt(p.lastName)}`, assists: p.assists, points: p.points, gp: p.gamesPlayed }))
      : [],
    rating: await (async () => {
      const r = ratingLeaders(TEAM_ID, season);
      return { minGames: r.minGames, rows: await Promise.all(r.rows.map(async (g) => ({ id: g.playerId, name: await playerName(g.playerId, cs), avgRating: g.avgRating, gp: g.gp }))) };
    })(),
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
  let lastReport: GameReport | null = null;
  let lastRatings: HomeData["lastRatings"] = [];
  if (last) {
    const [pbp, landing] = await Promise.all([load(() => nhl.playByPlay(last.id)), load(() => nhl.gameLanding(last.id))]);
    if (pbp.ok) {
      lastReport = analyzeGame(pbp.data, landing.ok ? landing.data : null);
      const spots = new Map(pbp.data.rosterSpots.map((r) => [r.playerId, r]));
      lastRatings = gameRatings(last.id)
        .filter((r) => r.teamId === TEAM_ID)
        .slice(0, 3)
        .map((r) => {
          const p = spots.get(r.playerId);
          return { id: r.playerId, name: p ? `${txt(p.firstName)} ${txt(p.lastName)}` : `Player ${r.playerId}`, pos: r.pos, rating: r.rating, gameScore: r.gameScore };
        });
    }
  }

  const statsUpdated = (getDb().$client.prepare(`SELECT MAX(ingested_at) t FROM stats_games`).get() as { t: number | null }).t;

  return {
    season,
    currentSeason,
    seasonNote,
    ranksNote: lg.ranksReady ? null : RANKS_PENDING_NOTE,
    standings,
    edm,
    picture: rows.length ? playoffPicture(rows, TEAM, seasonGamesOf(games)) : null,
    odds: oddsFor(season, TEAM),
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
    recent,
    topRecent: await Promise.all(
      topGameScores(TEAM_ID, season).map(async (r) => {
        const assists = r.a1 + r.a2;
        const line =
          r.pos === "G"
            ? `${(r.gsax ?? 0) >= 0 ? "+" : ""}${(r.gsax ?? 0).toFixed(1)} goals saved above expected`
            : [r.goals && `${r.goals} G`, assists && `${assists} A`, `${r.sog} SOG`].filter(Boolean).join(" · ");
        return { id: r.playerId, name: await playerName(r.playerId, cs), gameId: r.gameId, date: r.date, opponent: r.opponent, isHome: r.isHome, rating: r.rating, gameScore: r.gameScore, line };
      }),
    ),
    trend: rollingShare(trendGames, "xgf5", "xga5", 5),
    leaders,
    clutch,
    shooting: await (async () => {
      const sh = await shootingData();
      return { ...hotAndCold(sh.shooters), note: sh.note };
    })(),
    lastReport,
    lastRatings,
    edge,
    bursts,
    rosterEdge: skaterEdge,
    updated: { stats: statsUpdated },
    sources: { summary, clubStats },
  };
}

/** Regular-season length from a club schedule (84 games from 2026-27). */
export function seasonGamesOf(games: ScheduleGame[]): number {
  const n = games.filter((g) => g.gameType === 2).length;
  return n >= 60 ? n : SEASON_GAMES;
}

/** A team's latest simulated playoff odds and how they've moved this season. */
export function oddsFor(season: number, team: string): HomeData["odds"] {
  const latest = latestOdds(season);
  const row = latest?.rows.find((r) => r.team === team);
  return latest && row ? { odds: row.odds, projPoints: row.projPoints, runAt: latest.runAt, history: oddsHistory(season, team) } : null;
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
