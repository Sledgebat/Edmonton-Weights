/* eslint-disable @typescript-eslint/no-explicit-any -- raw, not-yet-validated NHL JSON; Zod schemas arrive in Phase 3 */
/**
 * Phase 1: hit every endpoint in the plan's Data sources table once,
 * save the raw responses under fixtures/v1/..., and report what failed.
 *
 *   npm run fixtures:capture             # all endpoints + 3 sample history seasons
 *   npm run fixtures:capture -- --history  # also every Oilers season since 1979-80
 *
 * Runs from your own machine (needs normal internet access to api-web.nhle.com).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FIRST_NHL_SEASON,
  NHL_API_BASE,
  PLAYERS,
  USER_AGENT,
  endpoints,
  fixturePathFor,
  isFinished,
  previousSeason,
  seasonsSince,
} from "../lib/nhl/endpoints";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures");
const DELAY_MS = 400; // be polite: roughly 2 requests a second
const MAX_RETRIES = 3;
const fullHistory = process.argv.includes("--history");

type Result = {
  group: string;
  name: string;
  path: string;
  ok: boolean;
  status: number | null;
  bytes: number;
  ms: number;
  file: string | null;
  error?: string;
};

const results: Result[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(apiPath: string): Promise<{ status: number; body: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(NHL_API_BASE + apiPath, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        redirect: "follow",
      });
      const body = await res.text();
      // Retry only on rate limits / server errors, with exponential backoff.
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES - 1) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return { status: res.status, body };
    } catch (err) {
      lastErr = err;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

/** Fetch, save and record one endpoint. Returns parsed JSON or null. */
async function capture(group: string, name: string, apiPath: string): Promise<any | null> {
  const started = Date.now();
  const rel = fixturePathFor(apiPath);
  const r: Result = { group, name, path: apiPath, ok: false, status: null, bytes: 0, ms: 0, file: null };
  try {
    const { status, body } = await fetchJson(apiPath);
    r.status = status;
    r.bytes = Buffer.byteLength(body);
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const json = JSON.parse(body); // fails loudly on a non-JSON response
    const abs = path.join(FIXTURES_DIR, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, JSON.stringify(json, null, 2) + "\n");
    r.ok = true;
    r.file = `fixtures/${rel}`;
    return json;
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
    return null;
  } finally {
    r.ms = Date.now() - started;
    results.push(r);
    const mark = r.ok ? "ok  " : "FAIL";
    console.log(`${mark} ${String(r.status ?? "---").padEnd(4)} ${apiPath}${r.error ? `  (${r.error})` : ""}`);
    await sleep(DELAY_MS);
  }
}

type Game = { id: number; gameType: number; gameState: string; startTimeUTC: string };

function pickGames(games: Game[]) {
  const sorted = [...games].sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC));
  const finished = sorted.filter((g) => isFinished(g.gameState));
  const lastFinished =
    [...finished].reverse().find((g) => g.gameType === 2 || g.gameType === 3) ?? finished.at(-1);
  const next = sorted.find((g) => !isFinished(g.gameState));
  return { lastFinished, next };
}

async function main() {
  console.log(`Capturing NHL fixtures into ${FIXTURES_DIR}\n`);

  // 1. League-wide and team endpoints.
  const standings = await capture("core", "Standings", endpoints.standingsNow());
  const schedule = await capture("core", "Schedule (current season)", endpoints.scheduleNow());
  await capture("core", "Scoreboard", endpoints.scoreNow());
  const roster = await capture("core", "Roster", endpoints.rosterCurrent());
  await capture("core", "Club stats", endpoints.clubStatsNow());
  await capture("stretch", "Prospects", endpoints.prospects());

  const currentSeason: number =
    schedule?.currentSeason ?? standings?.standings?.[0]?.seasonId ?? 20262027;

  // 2. Games: the last finished game (for final/replay) and the next one (pre-game).
  const games: Game[] = schedule?.games ?? [];
  const picked = pickGames(games);
  const next = picked.next;
  let lastFinished = picked.lastFinished;
  if (!lastFinished || lastFinished.gameType === 1) {
    // Preseason or opening night: borrow last season's final regular/playoff game for replay tests.
    const prev = await capture(
      "core",
      "Schedule (previous season)",
      endpoints.scheduleSeason(previousSeason(currentSeason)),
    );
    const prevPick = pickGames(prev?.games ?? []);
    if (prevPick.lastFinished) lastFinished = prevPick.lastFinished;
  }

  const picks: Record<string, unknown> = { currentSeason };
  if (lastFinished) {
    picks.lastFinishedGameId = lastFinished.id;
    await capture("game", "Game landing (final)", endpoints.gameLanding(lastFinished.id));
    await capture("game", "Play-by-play (final)", endpoints.gamePlayByPlay(lastFinished.id));
    await capture("game", "Boxscore (final)", endpoints.gameBoxscore(lastFinished.id));
  } else {
    console.log("! No finished Oilers game found to capture");
  }
  if (next) {
    picks.nextGameId = next.id;
    await capture("game", "Game landing (upcoming)", endpoints.gameLanding(next.id));
    await capture("game", "Play-by-play (upcoming)", endpoints.gamePlayByPlay(next.id));
    await capture("game", "Boxscore (upcoming)", endpoints.gameBoxscore(next.id));
  }

  // 3. Players: everyone on the roster (so every player page works offline), McDavid and
  //    Draisaitl first. Goalies matter: their stats have a different shape.
  const goalieId: number | undefined = roster?.goalies?.[0]?.id;
  picks.goalieId = goalieId ?? null;
  const players = new Map<number, string>([
    [PLAYERS.mcdavid, "McDavid"],
    [PLAYERS.draisaitl, "Draisaitl"],
  ]);
  for (const group of ["forwards", "defensemen", "goalies"] as const) {
    for (const p of roster?.[group] ?? []) {
      if (!players.has(p.id)) players.set(p.id, `${p.firstName?.default ?? ""} ${p.lastName?.default ?? p.id}`.trim());
    }
  }

  for (const [id, label] of players) {
    const landing = await capture("player", `${label} landing`, endpoints.playerLanding(id));
    // Game logs: this season's regular season, plus last season's so there is always data.
    const seasons = new Set<number>([currentSeason, previousSeason(currentSeason)]);
    if (landing?.featuredStats?.season) seasons.add(landing.featuredStats.season);
    for (const s of seasons) {
      await capture("player", `${label} game log ${s}`, endpoints.playerGameLog(id, s, 2));
    }
  }

  // 4. On This Day history: 3 sample seasons by default, every season with --history.
  const historySeasons = fullHistory
    ? seasonsSince(FIRST_NHL_SEASON, currentSeason)
    : [19791980, 19831984, 20052006];
  for (const s of historySeasons) {
    await capture("history", `Schedule ${s}`, endpoints.scheduleSeason(s));
  }

  // 5. Report.
  const failed = results.filter((r) => !r.ok);
  const report = {
    capturedAt: new Date().toISOString(),
    base: NHL_API_BASE,
    fullHistory,
    picks,
    totals: { requested: results.length, ok: results.length - failed.length, failed: failed.length },
    results,
  };
  await mkdir(FIXTURES_DIR, { recursive: true });
  await writeFile(path.join(FIXTURES_DIR, "_report.json"), JSON.stringify(report, null, 2) + "\n");

  const md = [
    `# Fixture capture report`,
    ``,
    `Captured ${report.capturedAt} from \`${NHL_API_BASE}\`. ${report.totals.ok}/${report.totals.requested} succeeded.`,
    ``,
    `| Group | Endpoint | Status | Size | Result |`,
    `| --- | --- | --- | --- | --- |`,
    ...results.map(
      (r) =>
        `| ${r.group} | \`${r.path}\` | ${r.status ?? "—"} | ${(r.bytes / 1024).toFixed(1)} KB | ${r.ok ? "ok" : `**failed**: ${r.error}`} |`,
    ),
    ``,
  ].join("\n");
  await writeFile(path.join(FIXTURES_DIR, "REPORT.md"), md);

  console.log(`\n${report.totals.ok}/${report.totals.requested} endpoints captured.`);
  if (failed.length) {
    console.log(`\nFailed:`);
    for (const f of failed) console.log(`  ${f.path}  ${f.error}`);
  }
  console.log(`\nReport written to fixtures/REPORT.md — open http://localhost:3000 to see it.`);
  process.exitCode = failed.some((f) => f.group === "core") ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
