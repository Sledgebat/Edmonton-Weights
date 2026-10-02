/**
 * The scheduled update (run by GitHub Actions before each build, or by hand):
 *   1. adds every finished game not yet stored, league-wide, for this season
 *   2. on a fresh database, also loads last season (used for the "last season" views)
 *   3. adds shift charts (who was on the ice) for any stored game of this season or last that
 *      doesn't have them yet; the one-time backfill is capped per run and carries on next run
 *   4. simulates the rest of the regular season for every team's playoff odds, and saves them
 *   5. packs the database into one file, ready to save for the next run
 *
 *   npm run update
 */
import { databasePath, getDb } from "../db";
import { fetchFresh } from "../lib/nhl/client";
import { endpoints, previousSeason, seasonLabel } from "../lib/nhl/endpoints";
import { ClubSchedule, Standings } from "../lib/nhl/schemas";
import { ingestMissing, ingestShiftsMissing, listSeasonGames, listSeasonSchedule, statsCounts } from "../lib/stats/ingest";
import { formatOdds, runPlayoffOdds } from "../lib/stats/odds";

/** A full regular season is 1,312 games; below this we treat last season as not yet loaded. */
const FULL_SEASON = 1300;

async function catchUp(season: number, schedule?: Awaited<ReturnType<typeof listSeasonSchedule>>) {
  console.log(`${seasonLabel(season)}: checking for new games...`);
  const games = schedule ? schedule.filter((g) => g.gameState === "FINAL" || g.gameState === "OFF") : await listSeasonGames(season, console.log);
  const r = await ingestMissing(games);
  console.log(`  ${games.length} finished games · ${r.attempted - r.failed.length} added · ${r.failed.length} failed`);
  for (const f of r.failed.slice(0, 5)) console.log(`    ${f.id}: ${f.error}`);
  return r.failed.length;
}

async function main() {
  console.log(`Database: ${databasePath()}`);
  const current = (await fetchFresh(endpoints.scheduleNow(), ClubSchedule)).currentSeason;
  const schedule = await listSeasonSchedule(current, console.log);
  let failed = await catchUp(current, schedule);

  const prev = previousSeason(current);
  const stored = statsCounts().games.find((g) => g.season === prev)?.n ?? 0;
  if (stored < FULL_SEASON) failed += await catchUp(prev);

  console.log("Shift charts: checking for games without them...");
  const sh = await ingestShiftsMissing([current, prev]);
  console.log(`  ${sh.todo} needed · ${sh.stored} added · ${sh.unavailable} not published yet · ${sh.failed.length} failed${sh.remaining ? ` · ${sh.remaining} left for the next run` : ""}`);
  for (const f of sh.failed.slice(0, 5)) console.log(`    ${f.id}: ${f.error}`);

  // Playoff odds, from the standings and the rest of the schedule, while the regular season lasts.
  if (schedule.some((g) => g.gameType === 2 && g.gameState !== "FINAL" && g.gameState !== "OFF")) {
    try {
      const standings = await fetchFresh(endpoints.standingsNow(), Standings);
      const started = Date.now();
      const odds = runPlayoffOdds(current, standings.standings, schedule);
      const edm = odds.find((o) => o.abbrev === "EDM");
      console.log(`Playoff odds: ${odds.length} teams in ${((Date.now() - started) / 1000).toFixed(1)} s${edm ? ` · Oilers ${formatOdds(edm.odds)}` : ""}`);
    } catch (err) {
      console.log(`Playoff odds skipped this run: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const counts = statsCounts();
  console.log(`Stored: ${counts.games.map((g) => `${seasonLabel(g.season)} ${g.n} games`).join(", ")} · ${counts.shots.toLocaleString("en-CA")} shots`);
  // A few failed downloads are retried next run; only fail the update if nothing worked at all.
  if (failed > 0) console.log(`${failed} games couldn't be downloaded this time; they'll be retried next run.`);
  getDb().$client.pragma("wal_checkpoint(TRUNCATE)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
