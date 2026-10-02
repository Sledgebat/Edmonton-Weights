/**
 * Calibrate player ratings for a season: the Game Score cut-offs come from every NHL regular-season
 * game in the two seasons before it (shift charts must be loaded: `npm run shifts:backfill`).
 * Run once each summer, after `npm run xg:train` / `npm run stats:rescore` if you retrain.
 *
 *   npm run ratings:calibrate               the current season
 *   npm run ratings:calibrate -- 20272028   a given season
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "../db";
import { fetchFresh } from "../lib/nhl/client";
import { endpoints, previousSeason, seasonLabel } from "../lib/nhl/endpoints";
import { ClubSchedule } from "../lib/nhl/schemas";
import { RATING_ANCHORS, calibrate, type RatingModel } from "../lib/stats/ratings";

async function main() {
  const arg = Number(process.argv[2]);
  const season = /^\d{8}$/.test(String(arg)) ? arg : (await fetchFresh(endpoints.scheduleNow(), ClubSchedule)).currentSeason;
  const from = [previousSeason(previousSeason(season)), previousSeason(season)];
  const db = getDb().$client;
  const scores = (pos: "skater" | "goalie") =>
    (
      db
        .prepare(
          `SELECT game_score gs FROM player_games WHERE season IN (${from.join(",")}) AND game_type = 2 AND ${pos === "goalie" ? "pos = 'G'" : "pos != 'G'"}`,
        )
        .all() as { gs: number }[]
    ).map((r) => r.gs);
  const skater = scores("skater");
  const goalie = scores("goalie");
  if (skater.length < 50_000 || goalie.length < 2_000) {
    throw new Error(`Not enough games with shift data in ${from.map(seasonLabel).join(" and ")} (${skater.length} skater games). Run npm run shifts:backfill first.`);
  }
  const round = (xs: number[]) => xs.map((x) => Math.round(x * 1000) / 1000);
  const model: RatingModel = {
    season,
    calibratedFrom: from,
    calibratedAt: new Date().toISOString().slice(0, 10),
    skater: { games: skater.length, cutoffs: round(calibrate(skater)) },
    goalie: { games: goalie.length, cutoffs: round(calibrate(goalie)) },
  };
  writeFileSync(path.join(process.cwd(), "lib", "stats", "rating-model.json"), JSON.stringify(model, null, 2) + "\n");
  console.log(`Ratings for ${seasonLabel(season)}, calibrated on ${from.map(seasonLabel).join(" and ")}:`);
  for (const kind of ["skater", "goalie"] as const) {
    console.log(`  ${kind}s (${model[kind].games.toLocaleString("en-CA")} games)`);
    RATING_ANCHORS.forEach(([p, r], i) => console.log(`    rating ${r.toFixed(1)} at percentile ${(p * 100).toFixed(1)}: Game Score ${model[kind].cutoffs[i].toFixed(2)}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
