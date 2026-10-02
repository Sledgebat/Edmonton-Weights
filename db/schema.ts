import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One row per NHL endpoint path. `body` is the last response that passed Zod validation,
 * so a bad or failed refresh never overwrites good data.
 */
export const apiCache = sqliteTable("api_cache", {
  path: text("path").primaryKey(),
  body: text("body").notNull(),
  /** When `body` was fetched (ms since epoch). */
  fetchedAt: integer("fetched_at").notNull(),
  /** When to try refreshing (ms since epoch). Pushed back with backoff after failures. */
  expiresAt: integer("expires_at").notNull(),
  /** Consecutive failed refreshes; drives exponential backoff. */
  failCount: integer("fail_count").notNull().default(0),
  lastError: text("last_error"),
  lastErrorAt: integer("last_error_at"),
});

/** Small key/value store for process-independent state (e.g. when a replay started). */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------- advanced stats (Phase 5)

/** One row per finished game whose shots have been extracted. */
export const statsGames = sqliteTable(
  "stats_games",
  {
    id: integer("id").primaryKey(),
    season: integer("season").notNull(),
    gameType: integer("game_type").notNull(),
    gameDate: text("game_date").notNull(),
    homeId: integer("home_id").notNull(),
    awayId: integer("away_id").notNull(),
    homeAbbrev: text("home_abbrev").notNull(),
    awayAbbrev: text("away_abbrev").notNull(),
    homeScore: integer("home_score").notNull(),
    awayScore: integer("away_score").notNull(),
    lastPeriodType: text("last_period_type").notNull(),
    ingestedAt: integer("ingested_at").notNull(),
  },
  (t) => [index("stats_games_season").on(t.season, t.gameType)],
);

/** Every shot attempt (Corsi event) with the features the xG model uses. */
export const shots = sqliteTable(
  "shots",
  {
    gameId: integer("game_id").notNull(),
    eventId: integer("event_id").notNull(),
    season: integer("season").notNull(),
    gameType: integer("game_type").notNull(),
    period: integer("period").notNull(),
    gameSeconds: integer("game_seconds").notNull(),
    teamId: integer("team_id").notNull(),
    oppTeamId: integer("opp_team_id").notNull(),
    isHome: integer("is_home", { mode: "boolean" }).notNull(),
    shooterId: integer("shooter_id"),
    goalieId: integer("goalie_id"),
    type: text("type").notNull(),
    shotType: text("shot_type"),
    x: real("x"),
    y: real("y"),
    distance: real("distance"),
    angle: real("angle"),
    ownSkaters: integer("own_skaters").notNull(),
    oppSkaters: integer("opp_skaters").notNull(),
    strength: text("strength").notNull(),
    rebound: integer("rebound", { mode: "boolean" }).notNull(),
    rush: integer("rush", { mode: "boolean" }).notNull(),
    highDanger: integer("high_danger", { mode: "boolean" }).notNull(),
    lastEvent: text("last_event").notNull(),
    secondsSinceLast: integer("seconds_since_last").notNull(),
    isGoal: integer("is_goal", { mode: "boolean" }).notNull(),
    xg: real("xg").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.eventId] }),
    index("shots_team_season").on(t.teamId, t.season),
    index("shots_goalie").on(t.goalieId, t.season),
    index("shots_shooter").on(t.shooterId, t.season),
  ],
);

/** Seconds each team spent at each strength in a game, for per-60 rates. */
export const strengthTime = sqliteTable(
  "strength_time",
  {
    gameId: integer("game_id").notNull(),
    teamId: integer("team_id").notNull(),
    strength: text("strength").notNull(),
    seconds: integer("seconds").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.teamId, t.strength] })],
);

// ---------------------------------------------------------------- shift data (on-ice stats, lines, Game Score)

/**
 * Whether a game's shift charts have been processed: 1 = stored, 0 = the NHL had none yet.
 * Games without a row haven't been tried.
 */
export const shiftStatus = sqliteTable("shift_status", {
  gameId: integer("game_id").primaryKey(),
  status: integer("status").notNull(),
  checkedAt: integer("checked_at").notNull(),
});

/** One row per player per game: ice time, 5-on-5 on-ice numbers, Game Score inputs. */
export const playerGames = sqliteTable(
  "player_games",
  {
    gameId: integer("game_id").notNull(),
    playerId: integer("player_id").notNull(),
    teamId: integer("team_id").notNull(),
    season: integer("season").notNull(),
    gameType: integer("game_type").notNull(),
    /** F, D or G. */
    pos: text("pos").notNull(),
    toi: integer("toi").notNull(),
    toi5: integer("toi5").notNull(),
    cf: integer("cf").notNull(),
    ca: integer("ca").notNull(),
    gf: integer("gf").notNull(),
    ga: integer("ga").notNull(),
    xgf: real("xgf").notNull(),
    xga: real("xga").notNull(),
    goals: integer("goals").notNull(),
    a1: integer("a1").notNull(),
    a2: integer("a2").notNull(),
    sog: integer("sog").notNull(),
    blk: integer("blk").notNull(),
    pd: integer("pd").notNull(),
    pt: integer("pt").notNull(),
    fow: integer("fow").notNull(),
    fol: integer("fol").notNull(),
    gsax: real("gsax"),
    gameScore: real("game_score").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.playerId] }),
    index("player_games_player").on(t.playerId, t.season),
    index("player_games_season").on(t.season, t.gameType),
  ],
);

/** Forward lines (3) and defence pairs (2) with their 5-on-5 time and on-ice numbers, per game. */
export const unitGames = sqliteTable(
  "unit_games",
  {
    gameId: integer("game_id").notNull(),
    teamId: integer("team_id").notNull(),
    season: integer("season").notNull(),
    gameType: integer("game_type").notNull(),
    /** F (line) or D (pair). */
    kind: text("kind").notNull(),
    /** Player ids, ascending, joined with "-". */
    players: text("players").notNull(),
    toi5: integer("toi5").notNull(),
    cf: integer("cf").notNull(),
    ca: integer("ca").notNull(),
    gf: integer("gf").notNull(),
    ga: integer("ga").notNull(),
    xgf: real("xgf").notNull(),
    xga: real("xga").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.teamId, t.players] }), index("unit_games_team").on(t.teamId, t.season)],
);
