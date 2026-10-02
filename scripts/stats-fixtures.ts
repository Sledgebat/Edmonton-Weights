/**
 * Offline stats: store every finished game saved in fixtures/ (no network). Used by the tests and
 * for working without internet; real data comes from `npm run stats:backfill`.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { endpoints, fixturePathFor, isFinished } from "../lib/nhl/endpoints";
import { PlayByPlay, ShiftCharts } from "../lib/nhl/schemas";
import { ingestGame, storeShifts } from "../lib/stats/ingest";

const dir = path.join(process.cwd(), "fixtures", "v1", "gamecenter");
let stored = 0;
let withShifts = 0;
for (const id of readdirSync(dir)) {
  try {
    const pbp = PlayByPlay.parse(JSON.parse(readFileSync(path.join(dir, id, "play-by-play.json"), "utf8")));
    if (isFinished(pbp.gameState)) {
      ingestGame(pbp);
      stored++;
      try {
        const file = path.join(process.cwd(), "fixtures", fixturePathFor(endpoints.shiftCharts(pbp.id)));
        if (storeShifts(pbp, ShiftCharts.parse(JSON.parse(readFileSync(file, "utf8"))).data)) withShifts++;
      } catch {
        /* no shift charts saved for this game */
      }
    }
  } catch {
    /* no play-by-play saved for this game */
  }
}
console.log(`Stored ${stored} finished fixture game(s), ${withShifts} with shift charts.`);
