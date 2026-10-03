/**
 * Offline stats: store every finished game saved in fixtures/ (no network). Used by the tests and
 * for working without internet; real data comes from `npm run stats:backfill`.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { endpoints, fixturePathFor, isFinished } from "../lib/nhl/endpoints";
import { ClubSchedule, PlayByPlay, ShiftCharts, Standings } from "../lib/nhl/schemas";
import { ingestGame, storeShifts } from "../lib/stats/ingest";
import { runPlayoffOdds, runStakes } from "../lib/stats/odds";

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

// Playoff odds from the saved standings and the Oilers' schedule (other teams' remaining games
// aren't saved, so the simulation plays them against an average team).
try {
  const read = (rel: string) => JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", rel), "utf8"));
  const standings = Standings.parse(read(fixturePathFor(endpoints.standingsNow()))).standings;
  const schedule = ClubSchedule.parse(read(fixturePathFor(endpoints.scheduleNow())));
  const odds = runPlayoffOdds(schedule.currentSeason, standings, schedule.games);
  runStakes(schedule.currentSeason, standings, schedule.games, "EDM");
  console.log(`Playoff odds for ${odds.length} teams.`);
} catch (err) {
  console.log(`No playoff odds: ${err instanceof Error ? err.message : String(err)}`);
}
