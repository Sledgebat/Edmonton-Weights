/**
 * Re-train the xG model from shots already in the database, then re-score every shot.
 *   npm run xg:train                                   all complete seasons stored
 *   npm run xg:train -- --seasons=20242025,20252026
 * The current, partial season is left out by default so it can't leak into its own evaluation.
 */
import { getDb } from "../db";
import { rescoreAll, trainFromDatabase } from "../lib/stats/model-io";

let seasons = process.argv.find((a) => a.startsWith("--seasons="))?.split("=")[1]?.split(",").map(Number);
if (!seasons) {
  const rows = getDb()
    .$client.prepare(`SELECT season, COUNT(*) AS n FROM stats_games WHERE game_type = 2 GROUP BY season`)
    .all() as { season: number; n: number }[];
  seasons = rows.filter((r) => r.n >= 1000).map((r) => r.season); // complete regular seasons only
}
trainFromDatabase({ seasons });
rescoreAll();
