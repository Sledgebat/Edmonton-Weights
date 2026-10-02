/**
 * One-time: add shift charts for every stored game in the given seasons (default: every season
 * in the database). About 1,400 games a season, two downloads each; safe to stop and re-run.
 *
 *   npm run shifts:backfill               every stored season
 *   npm run shifts:backfill -- 20242025   one season
 */
import { databasePath, getDb } from "../db";
import { seasonLabel } from "../lib/nhl/endpoints";
import { ingestShiftsMissing } from "../lib/stats/ingest";

async function main() {
  console.log(`Database: ${databasePath()}`);
  const args = process.argv.slice(2).map(Number).filter((n) => /^\d{8}$/.test(String(n)));
  const seasons = args.length
    ? args
    : (getDb().$client.prepare(`SELECT DISTINCT season FROM stats_games ORDER BY season`).all() as { season: number }[]).map((r) => r.season);
  console.log(`Seasons: ${seasons.map(seasonLabel).join(", ")}`);
  let last = 0;
  const r = await ingestShiftsMissing(seasons, {
    budgetMs: 12 * 60 * 60_000,
    onProgress: (done, total, failed) => {
      if (done - last >= 50 || done === total) {
        last = done;
        console.log(`  ${done}/${total} games · ${failed} failed`);
      }
    },
  });
  console.log(`Done: ${r.stored} stored · ${r.unavailable} without shift data · ${r.failed.length} failed`);
  for (const f of r.failed.slice(0, 10)) console.log(`  ${f.id}: ${f.error}`);
  getDb().$client.pragma("wal_checkpoint(TRUNCATE)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
