# Oil Country Hub

A data-first Edmonton Oilers fan-site prototype built from the NHL's public web API.
Independent fan site. Not affiliated with the Edmonton Oilers, Oilers Entertainment Group or the NHL.

## Status

Phases 1–3 of 8 are done:

1. **Setup:** Next.js 16 + TypeScript (strict) + Tailwind 4, with Drizzle, better-sqlite3, Zod, Recharts,
   node-cron, Vitest and Playwright.
2. **Design system and site shell:** three jersey-era themes (Dynasty, Copper & Blue, Gear) in light and dark,
   header with jersey-swatch picker, light/dark and spoiler-free toggles, phone bottom nav, footer disclaimer,
   and a `/styleguide` page with contrast ratios. Routes for later phases show a "coming in Phase N" placeholder.
3. **Data layer:** typed NHL client with Zod schemas, a SQLite cache with last-good fallback and backoff,
   `/api/*` routes for browsers, fixtures mode and replay mode. `/data` shows it all working.

## First run

Requires Node 20.9 or newer.

```bash
npm install
npx playwright install chromium   # once, for the smoke tests
npm run fixtures:capture          # hits every NHL endpoint, saves fixtures/, writes fixtures/REPORT.md
npm run dev                       # http://localhost:3000
npm run worker                    # optional, second terminal: keeps the cache warm
```

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
- **The database** (`db/oil-country-hub.sqlite`, gitignored) is created automatically on first use.

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
| `npm run fixtures:capture` | Save one response per endpoint to `fixtures/v1/...` (add `-- --history` for every season since 1979-80) |
| `npm run db:migrate` | Create or upgrade the SQLite database (also happens automatically) |
| `npm run db:generate` | Generate a migration after editing `db/schema.ts` |
| `npm run themes:build` | Regenerate `styles/themes.css` after editing colours in `lib/theme/tokens.ts` |
| `npm run worker` | Keeps the cache warm: core feeds every minute (fetching only when stale), a live Oilers game every 20 s |
| `npm test` | Vitest unit tests (offline): schemas vs every fixture, cache fallback, replay |
| `npm run test:e2e` | Playwright smoke test in fixtures mode: every page in all three themes, desktop and phone |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

`NHL_API_BASE` can point the capture script at another host (used for a mock server in testing).

## Layout

```
app/            routes
components/     ui/, game/, charts/, rink/, theme/
lib/nhl/        endpoints, Zod schemas, cached client, replay engine
lib/sim/        playoff Monte Carlo (Phase 6)
lib/history/    On This Day builder (Phase 7)
lib/milestones/ milestone math (Phase 6)
db/             Drizzle schema, migrations, sqlite file (gitignored)
worker/         cron jobs
fixtures/       saved NHL responses, committed so tests run offline
scripts/        one-off tools (fixture capture)
tests/          unit/ (Vitest), e2e/ (Playwright)
```

## Design system

- **Colours** live in `lib/theme/tokens.ts`; `styles/themes.css` is generated from it. A unit test fails if any
  text/background pair drops below WCAG AA or if the CSS is out of date.
- **Themes** switch with `data-era="dynasty|copper|gear"` and `data-mode="light|dark"` on `<html>`, set before
  first paint by a small inline script and remembered in `localStorage`.
- **Spoiler-free mode** sets `data-spoilers="on"`; anything with the `spoiler` class blurs until tapped.
- **Fonts** (Saira Extra Condensed, Oswald, Barlow) are self-hosted through Fontsource packages rather than
  `next/font/google`, so builds and tests work offline. Saira Extra Condensed has no italic, so the hero slant
  is synthesised by the browser.
- **Trademarks:** no Oilers logos, crests, mascot or wordmark lettering anywhere; colours and general style only.

## Notes

- `npm audit` reports 4 moderate advisories in an old esbuild pulled in by `drizzle-kit`. It is dev-only
  (used for migrations) and doesn't ship with the site.
