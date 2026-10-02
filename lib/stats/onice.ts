/**
 * Shift-based stats from the database: player ratings per game, lines and pairs, on-ice and
 * relative (on vs off the ice) numbers, linemates. Everything is 5-on-5 unless noted.
 */
import { getDb } from "@/db";
import { ratingOf } from "./ratings";

const share = (f: number, a: number) => (f + a > 0 ? (100 * f) / (f + a) : null);

// ------------------------------------------------------------------ ratings

export type RatedGame = {
  gameId: number;
  playerId: number;
  teamId: number;
  pos: string;
  toi: number;
  toi5: number;
  cf: number;
  ca: number;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
  goals: number;
  a1: number;
  a2: number;
  sog: number;
  blk: number;
  gsax: number | null;
  gameScore: number;
  rating: number;
};

type PlayerGameRow = Omit<RatedGame, "rating">;
const PG_COLS = `game_id gameId, player_id playerId, team_id teamId, pos, toi, toi5, cf, ca, gf, ga, xgf, xga, goals, a1, a2, sog, blk, gsax, game_score gameScore`;
const rated = (r: PlayerGameRow): RatedGame => ({ ...r, rating: ratingOf(r.gameScore, r.pos) });

/** Every player in one game with his rating, best first. Empty until the game's shifts are stored. */
export function gameRatings(gameId: number): RatedGame[] {
  const rows = getDb().$client.prepare(`SELECT ${PG_COLS} FROM player_games WHERE game_id = ?`).all(gameId) as PlayerGameRow[];
  return rows.map(rated).sort((a, b) => b.rating - a.rating || b.gameScore - a.gameScore);
}

export type RatingLogRow = RatedGame & { date: string; opponent: string; isHome: boolean };

/** One player's rated games in a season (regular season), oldest first. */
export function ratingLog(playerId: number, season: number): RatingLogRow[] {
  const rows = getDb()
    .$client.prepare(
      `SELECT ${PG_COLS.replace(/(^|, )(\w+)/g, "$1pg.$2")}, g.game_date date, g.home_id homeId, g.home_abbrev homeAbbrev, g.away_abbrev awayAbbrev
       FROM player_games pg JOIN stats_games g ON g.id = pg.game_id
       WHERE pg.player_id = ? AND pg.season = ? AND pg.game_type = 2 ORDER BY g.game_date, g.id`,
    )
    .all(playerId, season) as (PlayerGameRow & { date: string; homeId: number; homeAbbrev: string; awayAbbrev: string })[];
  return rows.map(({ homeId, homeAbbrev, awayAbbrev, ...r }) => {
    const isHome = homeId === r.teamId;
    return { ...rated(r), date: r.date, isHome, opponent: isHome ? awayAbbrev : homeAbbrev };
  });
}

// ------------------------------------------------------------------ on-ice and relative

export type OnIce = {
  playerId: number;
  gp: number;
  toi5: number;
  cf: number;
  ca: number;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
  cfPct: number | null;
  xgfPct: number | null;
  gfPct: number | null;
  /** The team's numbers in the same games with him off the ice. */
  offCfPct: number | null;
  offXgfPct: number | null;
  /** On minus off, in percentage points: above zero = the team does better with him on. */
  relCfPct: number | null;
  relXgfPct: number | null;
};

/** On-ice and relative numbers for skaters, for one team (or one player) in a season. */
export function onIceTable(season: number, where: { teamId?: number; playerId?: number }, gameType = 2): OnIce[] {
  const filters = ["pg.season = @season", "pg.game_type = @gameType", "pg.pos != 'G'"];
  if (where.teamId !== undefined) filters.push("pg.team_id = @teamId");
  if (where.playerId !== undefined) filters.push("pg.player_id = @playerId");
  const rows = getDb()
    .$client.prepare(
      `WITH tf AS (
         SELECT game_id, team_id t, COUNT(*) c, SUM(xg) xg FROM shots
         WHERE season = @season AND game_type = @gameType AND strength = '5v5' GROUP BY game_id, team_id
       ), ta AS (
         SELECT game_id, opp_team_id t, COUNT(*) c, SUM(xg) xg FROM shots
         WHERE season = @season AND game_type = @gameType AND strength = '5v5' GROUP BY game_id, opp_team_id
       )
       SELECT pg.player_id playerId, COUNT(*) gp, SUM(pg.toi5) toi5, SUM(pg.cf) cf, SUM(pg.ca) ca, SUM(pg.gf) gf, SUM(pg.ga) ga,
         SUM(pg.xgf) xgf, SUM(pg.xga) xga,
         SUM(COALESCE(tf.c, 0)) tcf, SUM(COALESCE(ta.c, 0)) tca, SUM(COALESCE(tf.xg, 0)) txgf, SUM(COALESCE(ta.xg, 0)) txga
       FROM player_games pg
       LEFT JOIN tf ON tf.game_id = pg.game_id AND tf.t = pg.team_id
       LEFT JOIN ta ON ta.game_id = pg.game_id AND ta.t = pg.team_id
       WHERE ${filters.join(" AND ")}
       GROUP BY pg.player_id`,
    )
    .all({ season, gameType, teamId: where.teamId ?? null, playerId: where.playerId ?? null }) as {
    playerId: number;
    gp: number;
    toi5: number;
    cf: number;
    ca: number;
    gf: number;
    ga: number;
    xgf: number;
    xga: number;
    tcf: number;
    tca: number;
    txgf: number;
    txga: number;
  }[];
  return rows.map((r) => {
    const cfPct = share(r.cf, r.ca);
    const xgfPct = share(r.xgf, r.xga);
    const offCfPct = share(r.tcf - r.cf, r.tca - r.ca);
    const offXgfPct = share(r.txgf - r.xgf, r.txga - r.xga);
    return {
      playerId: r.playerId,
      gp: r.gp,
      toi5: r.toi5,
      cf: r.cf,
      ca: r.ca,
      gf: r.gf,
      ga: r.ga,
      xgf: r.xgf,
      xga: r.xga,
      cfPct,
      xgfPct,
      gfPct: share(r.gf, r.ga),
      offCfPct,
      offXgfPct,
      relCfPct: cfPct !== null && offCfPct !== null ? cfPct - offCfPct : null,
      relXgfPct: xgfPct !== null && offXgfPct !== null ? xgfPct - offXgfPct : null,
    };
  });
}

// ------------------------------------------------------------------ lines and pairs

export type Unit = {
  kind: "F" | "D";
  players: number[];
  gp: number;
  toi5: number;
  cf: number;
  ca: number;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
  cfPct: number | null;
  xgfPct: number | null;
};

type UnitRow = { kind: "F" | "D"; players: string; gp: number; toi5: number; cf: number; ca: number; gf: number; ga: number; xgf: number; xga: number };
const toUnit = (r: UnitRow): Unit => ({
  ...r,
  players: r.players.split("-").map(Number),
  cfPct: share(r.cf, r.ca),
  xgfPct: share(r.xgf, r.xga),
});

/** Lines below this much 5-on-5 time together over a season are left out (too small to mean much). */
export const MIN_UNIT_SECONDS = 20 * 60;

/** Every line or pair a team has used this season, with at least `minSeconds` together, most-used first. */
export function unitTable(teamId: number, season: number, minSeconds = MIN_UNIT_SECONDS, gameType = 2): Unit[] {
  const rows = getDb()
    .$client.prepare(
      `SELECT kind, players, COUNT(*) gp, SUM(toi5) toi5, SUM(cf) cf, SUM(ca) ca, SUM(gf) gf, SUM(ga) ga, SUM(xgf) xgf, SUM(xga) xga
       FROM unit_games WHERE team_id = ? AND season = ? AND game_type = ?
       GROUP BY kind, players HAVING SUM(toi5) >= ? ORDER BY SUM(toi5) DESC`,
    )
    .all(teamId, season, gameType, minSeconds) as UnitRow[];
  return rows.map(toUnit);
}

/** Every line and pair a team used in one game, most-used first. */
export function gameUnits(gameId: number, teamId: number): Unit[] {
  const rows = getDb()
    .$client.prepare(
      `SELECT kind, players, 1 gp, toi5, cf, ca, gf, ga, xgf, xga FROM unit_games WHERE game_id = ? AND team_id = ? ORDER BY toi5 DESC`,
    )
    .all(gameId, teamId) as UnitRow[];
  return rows.map(toUnit);
}

/**
 * The regular lines and pairs from a set of units: the most-used combination first, then the
 * next one that shares no players with those already picked (up to four lines and three pairs).
 */
export function regularUnits(units: Unit[]): { lines: Unit[]; pairs: Unit[] } {
  const pick = (kind: "F" | "D", max: number) => {
    const used = new Set<number>();
    const out: Unit[] = [];
    for (const u of [...units].filter((x) => x.kind === kind).sort((a, b) => b.toi5 - a.toi5)) {
      if (out.length >= max) break;
      if (u.players.some((p) => used.has(p))) continue;
      out.push(u);
      u.players.forEach((p) => used.add(p));
    }
    return out;
  };
  return { lines: pick("F", 4), pairs: pick("D", 3) };
}

/** The team's most recent game with shift data, and its regular lines and pairs. */
export function currentLines(teamId: number, season: number): { gameId: number; date: string; opponent: string; lines: Unit[]; pairs: Unit[] } | null {
  const g = getDb()
    .$client.prepare(
      `SELECT g.id, g.game_date date, g.home_id homeId, g.home_abbrev homeAbbrev, g.away_abbrev awayAbbrev
       FROM stats_games g JOIN shift_status s ON s.game_id = g.id AND s.status = 1
       WHERE g.season = ? AND (g.home_id = ? OR g.away_id = ?) ORDER BY g.game_date DESC, g.id DESC LIMIT 1`,
    )
    .get(season, teamId, teamId) as { id: number; date: string; homeId: number; homeAbbrev: string; awayAbbrev: string } | undefined;
  if (!g) return null;
  return { gameId: g.id, date: g.date, opponent: g.homeId === teamId ? g.awayAbbrev : g.homeAbbrev, ...regularUnits(gameUnits(g.id, teamId)) };
}

export type Linemate = { playerId: number; toi5: number; gp: number; xgfPct: number | null; cfPct: number | null };

/** Who a skater played with most at 5-on-5 (forwards: linemates; defencemen: partners), most time first. */
export function linemates(playerId: number, season: number, n = 5, gameType = 2): Linemate[] {
  const rows = getDb()
    .$client.prepare(
      `SELECT game_id, players, toi5, cf, ca, xgf, xga FROM unit_games
       WHERE season = ? AND game_type = ? AND ('-' || players || '-') LIKE ?`,
    )
    .all(season, gameType, `%-${Number(playerId)}-%`) as { game_id: number; players: string; toi5: number; cf: number; ca: number; xgf: number; xga: number }[];
  const by = new Map<number, { toi5: number; games: Set<number>; cf: number; ca: number; xgf: number; xga: number }>();
  for (const r of rows) {
    for (const id of r.players.split("-").map(Number)) {
      if (id === playerId) continue;
      const m = by.get(id) ?? { toi5: 0, games: new Set<number>(), cf: 0, ca: 0, xgf: 0, xga: 0 };
      m.toi5 += r.toi5;
      m.games.add(r.game_id);
      m.cf += r.cf;
      m.ca += r.ca;
      m.xgf += r.xgf;
      m.xga += r.xga;
      by.set(id, m);
    }
  }
  return [...by.entries()]
    .map(([id, m]) => ({ playerId: id, toi5: m.toi5, gp: m.games.size, xgfPct: share(m.xgf, m.xga), cfPct: share(m.cf, m.ca) }))
    .sort((a, b) => b.toi5 - a.toi5)
    .slice(0, n);
}

/** Whether any shift data is stored for a season (pages hide shift-based sections until it is). */
export function hasShiftData(season: number): boolean {
  return !!getDb().$client.prepare(`SELECT 1 FROM player_games WHERE season = ? LIMIT 1`).get(season);
}

// ------------------------------------------------------------------ Game Score leaders

/** A team's best single-game performances over its last `games` games with shift data, best first. */
export function topGameScores(teamId: number, season: number, games = 5, n = 5): RatingLogRow[] {
  const rows = getDb()
    .$client.prepare(
      `WITH recent AS (
         SELECT g.id FROM stats_games g JOIN shift_status s ON s.game_id = g.id AND s.status = 1
         WHERE g.season = ? AND g.game_type = 2 AND (g.home_id = ? OR g.away_id = ?)
         ORDER BY g.game_date DESC, g.id DESC LIMIT ?
       )
       SELECT ${PG_COLS.replace(/(^|, )(\w+)/g, "$1pg.$2")}, g.game_date date, g.home_id homeId, g.home_abbrev homeAbbrev, g.away_abbrev awayAbbrev
       FROM player_games pg JOIN stats_games g ON g.id = pg.game_id
       WHERE pg.game_id IN (SELECT id FROM recent) AND pg.team_id = ?
       ORDER BY pg.game_score DESC LIMIT ?`,
    )
    .all(season, teamId, teamId, games, teamId, n) as (PlayerGameRow & { date: string; homeId: number; homeAbbrev: string; awayAbbrev: string })[];
  return rows.map(({ homeId, homeAbbrev, awayAbbrev, ...r }) => {
    const isHome = homeId === r.teamId;
    return { ...rated(r), date: r.date, isHome, opponent: isHome ? awayAbbrev : homeAbbrev };
  });
}

export type RatingLeader = { playerId: number; gp: number; avgRating: number };

/**
 * A team's skaters by average rating this season (regular season), best first. Only players
 * who've played at least half the team's games (with shift data) qualify, so one big night
 * doesn't top the list.
 */
export function ratingLeaders(teamId: number, season: number, n = 5): { minGames: number; rows: RatingLeader[] } {
  const rows = getDb()
    .$client.prepare(
      `SELECT game_id gameId, player_id playerId, pos, game_score gs FROM player_games
       WHERE team_id = ? AND season = ? AND game_type = 2 AND pos != 'G'`,
    )
    .all(teamId, season) as { gameId: number; playerId: number; pos: string; gs: number }[];
  const teamGames = new Set(rows.map((r) => r.gameId)).size;
  const minGames = Math.max(1, Math.ceil(teamGames / 2));
  const by = new Map<number, { gp: number; ratings: number }>();
  for (const r of rows) {
    const m = by.get(r.playerId) ?? { gp: 0, ratings: 0 };
    m.gp++;
    m.ratings += ratingOf(r.gs, r.pos);
    by.set(r.playerId, m);
  }
  return {
    minGames,
    rows: [...by.entries()]
      .filter(([, m]) => m.gp >= minGames)
      .map(([playerId, m]) => ({ playerId, gp: m.gp, avgRating: m.ratings / m.gp }))
      .sort((a, b) => b.avgRating - a.avgRating || b.gp - a.gp)
      .slice(0, n),
  };
}
