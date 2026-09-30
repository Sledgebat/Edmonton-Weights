/**
 * Replay mode: `NHL_MODE=replay GAME_ID=2026020004 npm run dev`
 *
 * Serves one finished game as if it were live, at REPLAY_SPEED (default 10x), so the Game Day Hub
 * can be tested any day of the year. The clock starts on the first request and is stored in SQLite
 * so the web server and the worker agree; POST /api/replay restarts it.
 *
 * Affected endpoints: that game's landing / play-by-play / boxscore, /score/now (the game is
 * added to today's scoreboard) and the Oilers' current schedule (if the game is in it).
 * Everything else comes from fixtures.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb, schema as dbSchema } from "@/db";
import { NhlError, fixturesDir, getResource, now, registerReplay, type NhlMode, type Result } from "./client";
import { TEAM, endpoints } from "./endpoints";
import { DEFAULT_REPLAY, replayDuration, snapshotAt, type ReplayConfig, type ReplaySource } from "./replay-engine";
import { Boxscore, ClubSchedule, GameLanding, PlayByPlay, Scoreboard, type ScoreGame } from "./schemas";

export function replayConfig(): ReplayConfig {
  const num = (v: string | undefined, d: number) => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    speed: Math.max(1, num(process.env.REPLAY_SPEED, DEFAULT_REPLAY.speed)),
    pregameSeconds: Math.max(0, num(process.env.REPLAY_PREGAME_SECONDS, DEFAULT_REPLAY.pregameSeconds)),
    intermissionSeconds: Math.max(0, num(process.env.REPLAY_INTERMISSION_SECONDS, DEFAULT_REPLAY.intermissionSeconds)),
  };
}

/** GAME_ID, or the last finished Oilers game recorded by the fixture capture. */
export async function replayGameId(): Promise<number> {
  const fromEnv = Number(process.env.GAME_ID);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  try {
    const report = JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ fixturesDir(), "_report.json"), "utf8"));
    const id = Number(report?.picks?.lastFinishedGameId);
    if (Number.isInteger(id) && id > 0) return id;
  } catch {
    /* fall through */
  }
  throw new NhlError("Replay mode needs GAME_ID=<finished game id> (or fixtures from `npm run fixtures:capture`)", "/replay");
}

/** Underlying data: fixtures first, then the live cache (for games that were never captured). */
async function base<T>(apiPath: string, schema: z.ZodType<T>): Promise<Result<T>> {
  try {
    return await getResource(apiPath, schema, "fixtures");
  } catch (err) {
    if (err instanceof NhlError && err.status === 404) return getResource(apiPath, schema, "live");
    throw err;
  }
}

const sources = new Map<number, Promise<ReplaySource>>();
function loadSource(gameId: number): Promise<ReplaySource> {
  let p = sources.get(gameId);
  if (!p) {
    p = (async () => {
      const [pbp, landing, boxscore] = await Promise.all([
        base(endpoints.gamePlayByPlay(gameId), PlayByPlay),
        base(endpoints.gameLanding(gameId), GameLanding),
        base(endpoints.gameBoxscore(gameId), Boxscore),
      ]);
      if (pbp.data.gameState !== "OFF" && pbp.data.gameState !== "FINAL") {
        throw new NhlError(`Game ${gameId} hasn't finished (state ${pbp.data.gameState}); replay needs a finished game`, "/replay");
      }
      return { pbp: pbp.data, landing: landing.data, boxscore: boxscore.data };
    })();
    p.catch(() => sources.delete(gameId));
    sources.set(gameId, p);
  }
  return p;
}

const startKey = (gameId: number) => `replay:start:${gameId}`;

function startedAt(gameId: number): number {
  const db = getDb();
  const row = db.select().from(dbSchema.kv).where(eq(dbSchema.kv.key, startKey(gameId))).get();
  if (row) return Number(row.value);
  const t = now();
  db.insert(dbSchema.kv).values({ key: startKey(gameId), value: String(t), updatedAt: t }).onConflictDoNothing().run();
  return Number(db.select().from(dbSchema.kv).where(eq(dbSchema.kv.key, startKey(gameId))).get()!.value);
}

export async function restartReplay(): Promise<void> {
  const gameId = await replayGameId();
  getDb().delete(dbSchema.kv).where(eq(dbSchema.kv.key, startKey(gameId))).run();
}

export async function replaySnapshot() {
  const gameId = await replayGameId();
  const src = await loadSource(gameId);
  const cfg = replayConfig();
  const start = startedAt(gameId);
  const elapsed = Math.max(0, (now() - start) / 1000);
  return { gameId, start, elapsed, cfg, duration: replayDuration(src.pbp, cfg), ...snapshotAt(src, elapsed, cfg) };
}

/** The replayed game as a scoreboard entry. */
function asScoreGame(pbp: PlayByPlay): ScoreGame {
  const team = (t: PlayByPlay["homeTeam"]) => ({ ...t, name: t.commonName });
  return {
    id: pbp.id,
    season: pbp.season,
    gameType: pbp.gameType,
    gameDate: pbp.gameDate,
    startTimeUTC: pbp.startTimeUTC,
    venue: pbp.venue,
    venueTimezone: pbp.venueTimezone,
    gameState: pbp.gameState,
    gameScheduleState: pbp.gameScheduleState,
    tvBroadcasts: pbp.tvBroadcasts,
    homeTeam: team(pbp.homeTeam),
    awayTeam: team(pbp.awayTeam),
    periodDescriptor: pbp.periodDescriptor,
    gameOutcome: pbp.gameOutcome,
    clock: pbp.clock,
    period: pbp.periodDescriptor?.number,
  };
}

async function handle<T>(apiPath: string, zschema: z.ZodType<T>): Promise<Result<T> | null> {
  const gameId = await replayGameId();
  const m = /^\/gamecenter\/(\d+)\/(landing|play-by-play|boxscore)$/.exec(apiPath);
  const isGame = m && Number(m[1]) === gameId;
  const isScore = apiPath === endpoints.scoreNow();
  const isSchedule = apiPath === endpoints.scheduleNow(TEAM);
  if (!isGame && !isScore && !isSchedule) return null;

  const snap = await replaySnapshot();
  let raw: unknown;
  if (isGame) {
    raw = m![2] === "landing" ? snap.landing : m![2] === "play-by-play" ? snap.pbp : snap.boxscore;
  } else if (isScore) {
    const board = (await base(apiPath, Scoreboard)).data;
    raw = { ...board, games: [asScoreGame(snap.pbp), ...board.games.filter((g) => g.id !== gameId)] };
  } else {
    const sched = (await base(apiPath, ClubSchedule)).data;
    raw = {
      ...sched,
      games: sched.games.map((g) =>
        g.id === gameId
          ? {
              ...g,
              gameState: snap.pbp.gameState,
              periodDescriptor: snap.pbp.periodDescriptor,
              gameOutcome: snap.pbp.gameOutcome,
              homeTeam: { ...g.homeTeam, score: snap.pbp.homeTeam.score },
              awayTeam: { ...g.awayTeam, score: snap.pbp.awayTeam.score },
            }
          : g,
      ),
    };
  }

  const parsed = zschema.safeParse(raw);
  if (!parsed.success) throw new NhlError(`Replay produced invalid ${apiPath}: ${parsed.error.issues[0]?.message}`, apiPath);
  const mode: NhlMode = "replay";
  return {
    data: parsed.data,
    meta: {
      path: apiPath,
      mode,
      source: "replay",
      fetchedAt: now(),
      stale: false,
      warning: `Replay of game ${gameId} at ${snap.cfg.speed}x (synthetic live data)`,
    },
  };
}

registerReplay(handle);
