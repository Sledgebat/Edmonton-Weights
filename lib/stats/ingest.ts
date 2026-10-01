/**
 * Stores finished games' shot attempts and strength time in SQLite.
 * Used by the one-time backfill and by the worker for new games.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fetchFresh } from "@/lib/nhl/client";
import { endpoints, isFinished } from "@/lib/nhl/endpoints";
import { ClubSchedule, PlayByPlay, Standings, txt, type ScheduleGame } from "@/lib/nhl/schemas";
import { extractShots, strengthTime } from "./extract";
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
  return { shots: attempts.length };
}

/** Every finished regular-season and playoff game in a season, from all 32 club schedules. */
export async function listSeasonGames(season: number, onProgress?: (msg: string) => void): Promise<ScheduleGame[]> {
  const standings = await fetchFresh(endpoints.standingsNow(), Standings);
  const teams = [...new Set(standings.standings.map((r) => txt(r.teamAbbrev)))];
  const games = new Map<number, ScheduleGame>();
  for (const team of teams) {
    try {
      const sched = await fetchFresh(endpoints.scheduleSeason(season, team), ClubSchedule);
      for (const g of sched.games) {
        if ((g.gameType === 2 || g.gameType === 3) && isFinished(g.gameState)) games.set(g.id, g);
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

/** Counts for the status page. */
export function statsCounts() {
  const db = getDb();
  const games = db
    .select({ season: schema.statsGames.season, n: sql<number>`count(*)` })
    .from(schema.statsGames)
    .groupBy(schema.statsGames.season)
    .all();
  const shotCount = db.select({ n: sql<number>`count(*)` }).from(schema.shots).get()?.n ?? 0;
  return { games, shots: shotCount };
}

