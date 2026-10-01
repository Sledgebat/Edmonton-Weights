/**
 * Scheduled jobs (run with `npm run worker` in a second terminal).
 *
 * Cache warming: the worker asks the NHL client for each feed on a schedule. The client only
 * goes to the NHL when a feed's TTL has expired, so these jobs keep the cache fresh without
 * ever exceeding the refresh intervals, and a live Oilers game is polled by exactly one process
 * no matter how many people are watching.
 *
 * Advanced stats: finished games (every team) are stored every 15 minutes and a full-season
 * catch-up runs nightly, so league ranks stay current.
 */
import cron from "node-cron";
import { nhl, nhlMode } from "@/lib/nhl";
import { fetchFresh } from "@/lib/nhl/client";
import { endpoints, isFinished, isLive } from "@/lib/nhl/endpoints";
import { PlayByPlay } from "@/lib/nhl/schemas";
import { ingestGame, ingestMissing, isIngested, listSeasonGames } from "@/lib/stats/ingest";

const tz = "America/Edmonton";
const log = (msg: string) => console.log(`[worker ${new Date().toLocaleTimeString("en-CA", { timeZone: tz })}] ${msg}`);

async function safely(name: string, job: () => Promise<unknown>) {
  try {
    await job();
  } catch (err) {
    log(`${name} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Standings, schedule and scoreboard: cheap cache hits unless their TTL has passed. */
async function warmCore() {
  await safely("standings", nhl.standings);
  await safely("schedule", nhl.schedule);
  await safely("scoreboard", nhl.score);
}

/** While an Oilers game is live, keep its gamecenter data fresh (20-30 s TTLs). */
async function warmLiveGame() {
  const { data } = await nhl.score();
  const game = data.games.find((g) => isLive(g.gameState) && (g.homeTeam.abbrev === "EDM" || g.awayTeam.abbrev === "EDM"));
  if (!game) return;
  const [landing] = await Promise.all([nhl.gameLanding(game.id), nhl.playByPlay(game.id), nhl.boxscore(game.id)]);
  const d = landing.data;
  log(`live ${d.awayTeam.abbrev} ${d.awayTeam.score ?? 0} @ ${d.homeTeam.abbrev} ${d.homeTeam.score ?? 0} (${d.clock?.timeRemaining ?? ""})`);
}

/** Advanced stats: store any game on today's scoreboard that has finished (every team, for league ranks). */
async function ingestToday() {
  const { data } = await nhl.score();
  for (const g of data.games) {
    if ((g.gameType === 2 || g.gameType === 3) && isFinished(g.gameState) && !isIngested(g.id)) {
      const pbp = await fetchFresh(endpoints.gamePlayByPlay(g.id), PlayByPlay);
      ingestGame(pbp);
      log(`stats: stored ${g.awayTeam.abbrev} @ ${g.homeTeam.abbrev} (${g.id})`);
    }
  }
}

/** Nightly catch-up: every finished game this season that isn't stored yet. */
async function ingestSeason() {
  const season = (await nhl.schedule()).data.currentSeason;
  const games = await listSeasonGames(season);
  const r = await ingestMissing(games, { concurrency: 2, delayMs: 300 });
  log(`stats: season catch-up ${r.attempted - r.failed.length} added, ${r.skipped} already stored, ${r.failed.length} failed`);
}

async function warmDaily() {
  await safely("roster", nhl.roster);
  await safely("club stats", nhl.clubStats);
}

const mode = nhlMode();
if (mode !== "live") {
  log(`NHL_MODE=${mode}: nothing to refresh (data comes from fixtures), so the worker has nothing to do.`);
} else {
  const jobs = [
    cron.schedule("* * * * *", () => safely("core", warmCore), { timezone: tz, name: "core" }),
    cron.schedule("*/20 * * * * *", () => safely("live game", warmLiveGame), { timezone: tz, name: "live-game" }),
    cron.schedule("15 5 * * *", () => safely("daily", warmDaily), { timezone: tz, name: "daily" }),
    cron.schedule("0 * * * *", () => safely("team stats", nhl.clubStats), { timezone: tz, name: "club-stats" }),
    cron.schedule("*/15 * * * *", () => safely("stats: today's games", ingestToday), { timezone: tz, name: "ingest-today" }),
    cron.schedule("40 4 * * *", () => safely("stats: season catch-up", ingestSeason), { timezone: tz, name: "ingest-season" }),
  ];
  log("started: core feeds every minute (fetching only when stale), live game every 20 s, finished games stored every 15 min, season catch-up 4:40, roster 5:15.");
  void warmCore().then(warmDaily);

  process.on("SIGINT", () => {
    jobs.forEach((j) => j.stop());
    log("stopped");
    process.exit(0);
  });
}
