# EdmontonWeights

Edmonton Oilers stats, basic and advanced, in one place. Runs itself from the NHL's free public data and
calculates its own advanced stats.
Independent fan site. Not affiliated with the Edmonton Oilers, Oilers Entertainment Group or the NHL.

## How it runs

The site is a set of pre-built pages, rebuilt from the NHL's public data three times a day and hosted
free on GitHub Pages. There is no server to run or pay for.

- **`.github/workflows/update-site.yml`** runs at about 11:20 p.m., 3:15 a.m. and 9 a.m. Edmonton time (and
  whenever code is pushed, or from the Actions tab with "Run workflow"). It downloads the saved stats
  database, adds new games (`npm run update`), rebuilds every page (`npm run build`), saves the database
  back and publishes the site.
- **The stats database** is kept between runs as a file on the repository's `data` release
  (`edmontonweights.sqlite.gz`). Don't delete it; if it's lost, the next run rebuilds it from scratch
  (this season and last), which takes a few extra minutes.
- **If the NHL's data can't be reached or has changed shape**, that run fails, GitHub emails you, and the
  site keeps showing the last good version.
- **Live games** aren't followed: a game page shows a snapshot from the last update and links to NHL.com.

### Putting it online (once)

1. Publish this folder as a **public** GitHub repository (GitHub Desktop: File → Add local repository, then
   Publish repository and untick "Keep this code private"). Free GitHub Pages needs a public repository.
2. On GitHub, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open the **Actions** tab, choose **Update site**, and click **Run workflow**. The first run takes about
   15–20 minutes (it loads two seasons of games); later runs take a few minutes.
4. The site appears at `https://<your-username>.github.io/<repository-name>/`. A custom domain can be added
   later under Settings → Pages.

## First run

Requires Node 20.9 or newer.

```bash
npm install
npx playwright install chromium   # once, for the smoke tests
npm run fixtures:capture          # hits every NHL endpoint, saves fixtures/, writes fixtures/REPORT.md
npm run dev                       # http://localhost:3000, live data
npm run update                    # add new games to the local stats database
npm run build && npm run preview  # build the site exactly as it's published, at http://localhost:3000
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
