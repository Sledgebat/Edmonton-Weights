# EdmontonWeights

Edmonton Oilers stats, basic and advanced, in one place. Runs itself from the NHL's free public data and
calculates its own advanced stats.
Independent fan site. Not affiliated with the Edmonton Oilers, Oilers Entertainment Group or the NHL.

## Status

Building the stats site (plan: "Oilers Stats Site — Plan" in the Obsidian folder), steps 1–2 of 5 done.

1. **Trim (done):** the earlier fan-site prototype reduced to its foundation: the NHL data layer (validation,
   SQLite cache, fixtures and replay modes), schedule, standings, roster and player pages, and one theme
   (Oilers blue and orange, light and dark). Blog, On This Day, milestones, playoff odds, fan ratings,
   spoiler-free mode and the extra jersey themes were removed.
2. **Stats engine (done):** shot extraction from NHL play-by-play, our own expected-goals model (trained on
   2024-25 and 2025-26; held-out AUC 0.754, see `lib/stats/xg-report.md`), team and goalie advanced stats with
   league ranks, league-wide ingest by the worker, NHL EDGE and team-summary clients.
3. Home page: snapshot, team stats with league ranks, recent performance, leaders, NHL EDGE.
4. Game reports, players table, stats guide.
5. Polish.

## First run

Requires Node 20.9 or newer.

```bash
npm install
npx playwright install chromium   # once, for the smoke tests
npm run fixtures:capture          # hits every NHL endpoint, saves fixtures/, writes fixtures/REPORT.md
npm run dev                       # http://localhost:3000
npm run worker                    # optional, second terminal: keeps the cache warm
```

## Advanced stats

| Command | What it does |
| --- | --- |
| `npm run stats:backfill` | One-time: download 2024-25, 2025-26 and this season so far, keep only the shots, train the xG model (15–30 min, ~55 MB) |
| `npm run stats:rescore` | Apply the current shot definitions and re-score every stored shot with `lib/stats/xg-model.json` (no download) |
| `npm run xg:train` | Re-train the model on the complete seasons stored |
| `npm run stats:fixtures` | Offline: store the finished games saved in `fixtures/` (used by the tests) |

Definitions (also on the site): Corsi = all shot attempts; Fenwick = unblocked attempts; high-danger = unblocked
attempts from the inner slot, or rebounds from the slot; xG = probability an unblocked attempt scores; GSAx = expected
goals faced minus goals allowed. The worker stores every finished NHL game every 15 minutes and catches up nightly.

## Data modes

| Command | What you get |
| --- | --- |
| `npm run dev` | **Live**: real NHL data through the SQLite cache |
| `NHL_MODE=fixtures npm run dev` | **Fixtures**: saved responses from `fixtures/`, no network (off-season, offline, tests) |
| `NHL_MODE=replay npm run dev` | **Replay**: the last captured finished game plays back as if live at 10x; everything else from fixtures |
| `NHL_MODE=replay GAME_ID=2026020004 npm run dev` | Replay a specific finished game |

Replay settings: `REPLAY_SPEED` (default 10), `REPLAY_PREGAME_SECONDS` (30), `REPLAY_INTERMISSION_SECONDS` (15).
`POST /api/replay` (or the button on `/data`) restarts it.

## How the data layer works

- **Only the server calls the NHL.** Pages and browsers use the site's `/api/*` routes, which read the cache.
  Concurrent requests share one upstream fetch, so one live game means one poller however many people watch.
- **Everything is validated** with Zod (`lib/nhl/schemas.ts`). A response is cached only if it passes. If the
  NHL changes a field, is down, or errors, the last good copy is served with `meta.stale = true` and a warning
  in the server log, and retries back off from 30 s up to 15 min.
- **Refresh intervals** live in `lib/nhl/resources.ts` (standings 10 min; schedule hourly, 5 min on game days;
  scoreboard 1 min on game days; live game data 20–30 s; finished games a day; roster daily).
- **Every response** is `{ data, meta }`, where `meta.fetchedAt` drives the "last updated" stamp.
- **The database** (`db/edmontonweights.sqlite`, gitignored) is created automatically on first use.

| API route | Returns |
| --- | --- |
| `/api/standings` | League standings |
| `/api/schedule` · `?season=19831984` | Oilers schedule and results |
| `/api/score` | Today's scoreboard |
| `/api/game/{id}` · `?parts=landing,pbp,boxscore` | Everything the Game Day Hub needs, in one poll |
| `/api/roster` · `/api/club-stats` · `/api/prospects` | Team data |
| `/api/player/{id}` · `?gameLog=20252026&gameType=2` | Player bio and stats, or a game log |
| `/api/status` · `/api/replay` | Data-layer health; replay progress (POST to restart) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm run fixtures:capture` | Save one response per endpoint to `fixtures/v1/...`, including every roster player (about a minute; add `-- --history` for every season since 1979-80) |
| `npm run db:migrate` | Create or upgrade the SQLite database (also happens automatically) |
| `npm run db:generate` | Generate a migration after editing `db/schema.ts` |
| `npm run themes:build` | Regenerate `styles/themes.css` after editing colours in `lib/theme/tokens.ts` |
| `npm run worker` | Keeps the cache warm: core feeds every minute (fetching only when stale), a live Oilers game every 20 s |
| `npm test` | Vitest unit tests (offline): schemas vs every fixture, cache fallback, replay |
| `npm run test:e2e` | Playwright smoke test in fixtures mode: every page in light and dark, desktop and phone |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

`NHL_API_BASE` can point the capture script at another host (used for a mock server in testing).

## Layout

```
app/            routes
components/     ui/, game/, charts/, rink/, theme/
lib/nhl/        endpoints, Zod schemas, cached client, replay engine
lib/stats/      shot extraction, xG model and training, team/goalie aggregates
db/             Drizzle schema, migrations, sqlite file (gitignored)
worker/         cron jobs
fixtures/       saved NHL responses, committed so tests run offline
scripts/        one-off tools (fixture capture)
tests/          unit/ (Vitest), e2e/ (Playwright)
```

## Design system

- **Colours** live in `lib/theme/tokens.ts`; `styles/themes.css` is generated from it. A unit test fails if any
  text/background pair drops below WCAG AA or if the CSS is out of date.
- **Light and dark** switch with `data-mode="light|dark"` on `<html>`, set before first paint by a small inline
  script and remembered in `localStorage`.
- **Fonts** (Saira Extra Condensed, Oswald, Barlow) are self-hosted through Fontsource packages rather than
  `next/font/google`, so builds and tests work offline. Saira Extra Condensed has no italic, so the hero slant
  is synthesised by the browser.
- **Trademarks:** no Oilers logos, crests, mascot or wordmark lettering anywhere; colours and general style only.

## Notes

- `npm audit` reports 4 moderate advisories in an old esbuild pulled in by `drizzle-kit`. It is dev-only
  (used for migrations) and doesn't ship with the site.
