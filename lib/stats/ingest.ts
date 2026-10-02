/**
 * Stores finished games' shot attempts and strength time in SQLite.
 * Used by the one-time backfill and by the worker for new games.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fetchFresh } from "@/lib/nhl/client";
import { endpoints, isFinished } from "@/lib/nhl/endpoints";
import { ClubSchedule, PlayByPlay, ShiftCharts, Standings, txt, type ScheduleGame, type Shift } from "@/lib/nhl/schemas";
import { extractGoals, rosterNames } from "./clutch";
import { extractShots, strengthTime } from "./extract";
import { onIceGame } from "./shifts";
import { scoreShots } from "./xg";

export function isIngested(gameId: number): boolean {
  return !!getDb().select({ id: schema.statsGames.id }).from(schema.statsGames).where(eq(schema.statsGames.id, gameId)).get();
}

export function ingestedIds(season?: number): Set<number> {
  const q = getDb().select({ id: schema.statsGames.id }).from(schema.statsGames);
  const rows = season ? q.where(eq(schema.statsGames.season, season)).all() : q.all();
  return new Set(rows.map((r) => r.id));
}

/** Extract, score and store one finished game. Replaces anything stored for it before. */
export function ingestGame(pbp: PlayByPlay): { shots: number } {
  if (!isFinished(pbp.gameState)) throw new Error(`Game ${pbp.id} isn't finished (${pbp.gameState})`);
  const db = getDb();
  const attempts = scoreShots(extractShots(pbp));
  const time = strengthTime(pbp);

  db.transaction((tx) => {
    tx.delete(schema.shots).where(eq(schema.shots.gameId, pbp.id)).run();
    tx.delete(schema.strengthTime).where(eq(schema.strengthTime.gameId, pbp.id)).run();
    tx.insert(schema.statsGames)
      .values({
        id: pbp.id,
        season: pbp.season,
        gameType: pbp.gameType,
        gameDate: pbp.gameDate,
        homeId: pbp.homeTeam.id,
        awayId: pbp.awayTeam.id,
        homeAbbrev: pbp.homeTeam.abbrev,
        awayAbbrev: pbp.awayTeam.abbrev,
        homeScore: pbp.homeTeam.score ?? 0,
        awayScore: pbp.awayTeam.score ?? 0,
        lastPeriodType: pbp.gameOutcome?.lastPeriodType ?? "REG",
        ingestedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: schema.statsGames.id,
        set: { homeScore: pbp.homeTeam.score ?? 0, awayScore: pbp.awayTeam.score ?? 0, ingestedAt: Date.now() },
      })
      .run();
    for (let i = 0; i < attempts.length; i += 200) {
      tx.insert(schema.shots)
        .values(
          attempts.slice(i, i + 200).map((s) => ({
            gameId: s.gameId,
            eventId: s.eventId,
            season: pbp.season,
            gameType: pbp.gameType,
            period: s.period,
            gameSeconds: s.gameSeconds,
            teamId: s.teamId,
            oppTeamId: s.oppTeamId,
            isHome: s.isHome,
            shooterId: s.shooterId,
            goalieId: s.goalieId,
            type: s.type,
            shotType: s.shotType,
            x: s.x,
            y: s.y,
            distance: s.distance,
            angle: s.angle,
            ownSkaters: s.ownSkaters,
            oppSkaters: s.oppSkaters,
            strength: s.strength === "EN" && s.oppGoalieIn ? "EN-own" : s.strength,
            rebound: s.rebound,
            rush: s.rush,
            highDanger: s.highDanger,
            lastEvent: s.lastEvent,
            secondsSinceLast: s.secondsSinceLast,
            isGoal: s.isGoal,
            xg: s.xg,
          })),
        )
        .run();
    }
    for (const [teamId, states] of time) {
      for (const [strength, seconds] of Object.entries(states)) {
        if (seconds > 0) tx.insert(schema.strengthTime).values({ gameId: pbp.id, teamId, strength, seconds }).run();
      }
    }
  });
  storeGoals(pbp);
  return { shots: attempts.length };
}

// ------------------------------------------------------------------ goals (Clutch Score)

/** Store a finished game's goals (with the score before each) and its lineups' names. */
export function storeGoals(pbp: PlayByPlay) {
  const db = getDb();
  const goals = extractGoals(pbp);
  db.transaction((tx) => {
    tx.delete(schema.goals).where(eq(schema.goals.gameId, pbp.id)).run();
    if (goals.length) tx.insert(schema.goals).values(goals).run();
    for (const n of rosterNames(pbp)) {
      tx.insert(schema.playerNames)
        .values(n)
        .onConflictDoUpdate({
          target: schema.playerNames.playerId,
          set: { name: n.name, pos: n.pos, teamId: n.teamId, lastGameDate: n.lastGameDate },
          // A game older than the one we last saw (a backfill) never undoes a trade.
          setWhere: sql`${schema.playerNames.lastGameDate} <= ${n.lastGameDate}`,
        })
        .run();
    }
    tx.insert(schema.goalStatus)
      .values({ gameId: pbp.id, checkedAt: Date.now() })
      .onConflictDoUpdate({ target: schema.goalStatus.gameId, set: { checkedAt: Date.now() } })
      .run();
  });
}

/** Stored games in these seasons whose goals haven't been stored yet (games from before Clutch Score). */
export function gamesNeedingGoals(seasons: number[]): number[] {
  return (
    getDb()
      .$client.prepare(
        `SELECT g.id FROM stats_games g LEFT JOIN goal_status s ON s.game_id = g.id
         WHERE g.season IN (${seasons.map(Number).join(",") || "0"}) AND s.game_id IS NULL
         ORDER BY g.game_date DESC, g.id DESC`,
      )
      .all() as { id: number }[]
  ).map((r) => r.id);
}

/**
 * Re-download the play-by-play for stored games that don't have their goals yet (a one-time
 * catch-up). Stops after `budgetMs`; the next run carries on.
 */
export async function ingestGoalsMissing(
  seasons: number[],
  { concurrency = 3, delayMs = 200, budgetMs = 10 * 60_000 }: { concurrency?: number; delayMs?: number; budgetMs?: number } = {},
) {
  const todo = gamesNeedingGoals(seasons);
  const stopAt = Date.now() + budgetMs;
  let done = 0;
  const failed: { id: number; error: string }[] = [];
  let next = 0;
  async function worker() {
    while (next < todo.length && Date.now() < stopAt) {
      const id = todo[next++];
      try {
        storeGoals(await fetchFresh(endpoints.gamePlayByPlay(id), PlayByPlay));
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
      done++;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return { todo: todo.length, stored: done - failed.length, failed, remaining: todo.length - done };
}

/** Every finished regular-season and playoff game in a season, from all 32 club schedules. */
export async function listSeasonGames(season: number, onProgress?: (msg: string) => void): Promise<ScheduleGame[]> {
  return (await listSeasonSchedule(season, onProgress)).filter((g) => isFinished(g.gameState));
}

/** Every regular-season and playoff game in a season, played or not, from all 32 club schedules. */
export async function listSeasonSchedule(season: number, onProgress?: (msg: string) => void): Promise<ScheduleGame[]> {
  const standings = await fetchFresh(endpoints.standingsNow(), Standings);
  const teams = [...new Set(standings.standings.map((r) => txt(r.teamAbbrev)))];
  const games = new Map<number, ScheduleGame>();
  for (const team of teams) {
    try {
      const sched = await fetchFresh(endpoints.scheduleSeason(season, team), ClubSchedule);
      for (const g of sched.games) {
        if (g.gameType === 2 || g.gameType === 3) games.set(g.id, g);
      }
    } catch (err) {
      onProgress?.(`  schedule ${team} ${season}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return [...games.values()].sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC));
}

/** Download and ingest any finished games not yet stored. Returns counts. */
export async function ingestMissing(
  games: ScheduleGame[],
  { concurrency = 3, delayMs = 200, onProgress }: { concurrency?: number; delayMs?: number; onProgress?: (done: number, total: number, failed: number) => void } = {},
) {
  const have = ingestedIds();
  const todo = games.filter((g) => !have.has(g.id));
  let done = 0;
  const failed: { id: number; error: string }[] = [];
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const g = todo[next++];
      try {
        const pbp = await fetchFresh(endpoints.gamePlayByPlay(g.id), PlayByPlay);
        ingestGame(pbp);
        // Shift charts can lag the final horn; a miss here is retried by ingestShiftsMissing.
        await ingestShifts(pbp).catch(() => false);
      } catch (err) {
        failed.push({ id: g.id, error: err instanceof Error ? err.message : String(err) });
      }
      done++;
      onProgress?.(done, todo.length, failed.length);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return { attempted: todo.length, skipped: games.length - todo.length, failed };
}

// ------------------------------------------------------------------ shift charts

/**
 * Store one game's on-ice numbers, lines and Game Scores from its shift charts. Returns false
 * (and remembers to retry) when the NHL hasn't published usable shifts for both teams yet.
 */
export function storeShifts(pbp: PlayByPlay, shifts: Shift[]): boolean {
  const db = getDb();
  const teams = new Set(shifts.filter((s) => s.typeCode === 517).map((s) => s.teamId));
  const usable = teams.has(pbp.homeTeam.id) && teams.has(pbp.awayTeam.id);
  const { players, units } = usable ? onIceGame(pbp, shifts, scoreShots(extractShots(pbp))) : { players: [], units: [] };
  const base = { gameId: pbp.id, season: pbp.season, gameType: pbp.gameType };
  db.transaction((tx) => {
    tx.delete(schema.playerGames).where(eq(schema.playerGames.gameId, pbp.id)).run();
    tx.delete(schema.unitGames).where(eq(schema.unitGames.gameId, pbp.id)).run();
    for (const p of players) {
      const { playerId, teamId, pos, toi, toi5, cf, ca, gf, ga, xgf, xga, goals, a1, a2, sog, blk, pd, pt, fow, fol, gsax, gameScore } = p;
      tx.insert(schema.playerGames)
        .values({ ...base, playerId, teamId, pos, toi, toi5, cf, ca, gf, ga, xgf, xga, goals, a1, a2, sog, blk, pd, pt, fow, fol, gsax, gameScore })
        .run();
    }
    // Groups together for a few seconds during a change are noise and would triple the table.
    for (const u of units.filter((x) => x.toi5 >= MIN_STORED_UNIT_SECONDS)) {
      const { teamId, kind, toi5, cf, ca, gf, ga, xgf, xga } = u;
      tx.insert(schema.unitGames)
        .values({ ...base, teamId, kind, players: u.players.join("-"), toi5, cf, ca, gf, ga, xgf, xga })
        .run();
    }
    const status = { status: usable ? 1 : 0, checkedAt: Date.now() };
    tx.insert(schema.shiftStatus)
      .values({ gameId: pbp.id, ...status })
      .onConflictDoUpdate({ target: schema.shiftStatus.gameId, set: status })
      .run();
  });
  return usable;
}

/** Lines and pairs together for less than this in a game aren't stored. */
export const MIN_STORED_UNIT_SECONDS = 30;

export async function ingestShifts(pbp: PlayByPlay): Promise<boolean> {
  const charts = await fetchFresh(endpoints.shiftCharts(pbp.id), ShiftCharts);
  return storeShifts(pbp, charts.data);
}

/** Games the NHL still hasn't published shifts for after this many days are given up on. */
const SHIFT_RETRY_DAYS = 14;

/** Stored games in these seasons that still need their shift charts. */
export function gamesNeedingShifts(seasons: number[], today = new Date()): number[] {
  const cutoff = new Date(today.getTime() - SHIFT_RETRY_DAYS * 86_400_000).toISOString().slice(0, 10);
  return (
    getDb()
      .$client.prepare(
        `SELECT g.id FROM stats_games g LEFT JOIN shift_status s ON s.game_id = g.id
         WHERE g.season IN (${seasons.map(Number).join(",") || "0"})
           AND (s.game_id IS NULL OR (s.status = 0 AND g.game_date >= ?))
         ORDER BY g.game_date DESC, g.id DESC`,
      )
      .all(cutoff) as { id: number }[]
  ).map((r) => r.id);
}

/**
 * Download shift charts (and the play-by-play they're matched against) for stored games that
 * don't have them yet, newest first. Stops after `budgetMs` so one run never takes too long;
 * the next run carries on.
 */
export async function ingestShiftsMissing(
  seasons: number[],
  { concurrency = 3, delayMs = 200, budgetMs = 25 * 60_000, onProgress }: { concurrency?: number; delayMs?: number; budgetMs?: number; onProgress?: (done: number, total: number, failed: number) => void } = {},
) {
  const todo = gamesNeedingShifts(seasons);
  const stopAt = Date.now() + budgetMs;
  let done = 0;
  let stored = 0;
  let unavailable = 0;
  const failed: { id: number; error: string }[] = [];
  let next = 0;
  async function worker() {
    while (next < todo.length && Date.now() < stopAt) {
      const id = todo[next++];
      try {
        const pbp = await fetchFresh(endpoints.gamePlayByPlay(id), PlayByPlay);
        if (await ingestShifts(pbp)) stored++;
        else unavailable++;
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
      done++;
      onProgress?.(done, todo.length, failed.length);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return { todo: todo.length, stored, unavailable, failed, remaining: todo.length - done };
}

/** Counts for the status page. */
export function statsCounts() {
  const db = getDb();
  const games = db
    .select({ season: schema.statsGames.season, n: sql<number>`count(*)` })
    .from(schema.statsGames)
    .groupBy(schema.statsGames.season)
    .all();
  const shotCount = db.select({ n: sql<number>`count(*)` }).from(schema.shots).get()?.n ?? 0;
  const shiftGames = db.select({ n: sql<number>`count(*)` }).from(schema.shiftStatus).where(eq(schema.shiftStatus.status, 1)).get()?.n ?? 0;
  return { games, shots: shotCount, shiftGames };
}

