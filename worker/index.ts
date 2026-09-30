/**
 * Scheduled jobs (run with `npm run worker` in a second terminal).
 *
 * Phase 1 only proves node-cron is wired up. Real jobs arrive later:
 *   - Phase 3: cache warming for standings / schedule / scoreboard
 *   - Phase 6: nightly playoff Monte Carlo
 *   - Phase 7: yearly On This Day backfill
 */
import cron from "node-cron";

const tz = "America/Edmonton";

const heartbeat = cron.schedule(
  "*/5 * * * *",
  () => console.log(`[worker] heartbeat ${new Date().toISOString()}`),
  { timezone: tz, name: "heartbeat" },
);

console.log(`[worker] started (${tz}); jobs: heartbeat every 5 min. Ctrl+C to stop.`);

process.on("SIGINT", () => {
  heartbeat.stop();
  console.log("\n[worker] stopped");
  process.exit(0);
});
