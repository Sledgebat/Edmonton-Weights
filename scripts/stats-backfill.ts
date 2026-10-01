/**
 * One-time (and re-runnable) advanced-stats backfill:
 *   1. lists every finished game in the chosen seasons (all 32 club schedules)
 *   2. downloads each game's play-by-play, keeps only the shot attempts, stores them in SQLite
 *   3. trains the xG model on the past seasons and re-scores every shot
 *
 *   npm run stats:backfill                      # last two full seasons + this season so far
 *   npm run stats:backfill -- --seasons=20252026
 *   npm run stats:backfill -- --no-train
 *
 * Safe to stop and restart: games already stored are skipped. Takes roughly 15–30 minutes
 * the first time and needs about 50–100 MB of disk.
 */
import { statSync } from "node:fs";
import { databasePath, getDb } from "../db";
import { fetchFresh } from "../lib/nhl/client";
import { endpoints, previousSeason, seasonLabel } from "../lib/nhl/endpoints";
import { ClubSchedule } from "../lib/nhl/schemas";
import { ingestMissing, listSeasonGames, statsCounts } from "../lib/stats/ingest";
import { rescoreAll, trainFromDatabase } from "../lib/stats/model-io";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const flag = (name: string) => process.argv.includes(`--${name}`);

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  return m ? `${m} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`;
}

async function main() {
  const current = (await fetchFresh(endpoints.scheduleNow(), ClubSchedule)).currentSeason;
  const seasons = arg("seasons")
    ? arg("seasons")!.split(",").map(Number)
    : [previousSeason(previousSeason(current)), previousSeason(current), current];
  const pastSeasons = seasons.filter((s) => s !== current);
  console.log(`Advanced-stats backfill: ${seasons.map(seasonLabel).join(", ")}`);
  console.log(`Database: ${databasePath()}\n`);

  for (const season of seasons) {
    console.log(`${seasonLabel(season)}: listing games...`);
    const games = await listSeasonGames(season, console.log);
    const started = Date.now();
    let lastPrint = 0;
    const result = await ingestMissing(games, {
      onProgress: (done, total, failed) => {
        if (done === total || Date.now() - lastPrint > 5000) {
          lastPrint = Date.now();
          const elapsed = (Date.now() - started) / 1000;
          const eta = done ? (elapsed / done) * (total - done) : 0;
          process.stdout.write(
            `\r  ${done}/${total} games${failed ? ` (${failed} failed)` : ""} · ${fmtDuration(elapsed)} elapsed · ~${fmtDuration(eta)} left   `,
          );
        }
      },
    });
    if (result.attempted) process.stdout.write("\n");
    console.log(`  ${games.length} finished games: ${result.skipped} already stored, ${result.attempted - result.failed.length} added, ${result.failed.length} failed`);
    for (const f of result.failed.slice(0, 5)) console.log(`    ${f.id}: ${f.error}`);
    if (result.failed.length > 5) console.log(`    ...and ${result.failed.length - 5} more (run again to retry)`);
  }

  getDb().$client.pragma("wal_checkpoint(TRUNCATE)"); // fold the write-ahead log into the main file
  const counts = statsCounts();
  console.log(`\nStored: ${counts.games.map((g) => `${seasonLabel(g.season)} ${g.n} games`).join(", ")} · ${counts.shots.toLocaleString()} shot attempts`);
  try {
    console.log(`Database size: ${(statSync(databasePath()).size / 1e6).toFixed(1)} MB`);
  } catch {
    /* ignore */
  }

  if (!flag("no-train") && pastSeasons.length) {
    console.log(`\nTraining the xG model on ${pastSeasons.map(seasonLabel).join(" and ")}...`);
    const model = trainFromDatabase({ seasons: pastSeasons });
    const h = model.metrics.holdout as { testSeason: number; logLoss: number; baselineLogLoss: number; auc: number } | null;
    if (h) {
      console.log(
        `  Held-out ${seasonLabel(h.testSeason)}: AUC ${h.auc.toFixed(3)}, log loss ${h.logLoss.toFixed(4)} vs ${h.baselineLogLoss.toFixed(4)} with no model`,
      );
    }
    rescoreAll();
    console.log(`\nDone. Restart \`npm run dev\` to use the new model. Details: lib/stats/xg-report.md`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
