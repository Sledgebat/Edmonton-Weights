# Oil Country Hub

A data-first Edmonton Oilers fan-site prototype built from the NHL's public web API.
Independent fan site. Not affiliated with the Edmonton Oilers, Oilers Entertainment Group or the NHL.

## Status

Phases 1–2 of 8 are done:

1. **Setup:** Next.js 16 + TypeScript (strict) + Tailwind 4, with Drizzle, better-sqlite3, Zod, Recharts,
   node-cron, Vitest and Playwright.
2. **Design system and site shell:** three jersey-era themes (Dynasty, Copper & Blue, Gear) in light and dark,
   header with jersey-swatch picker, light/dark and spoiler-free toggles, phone bottom nav, footer disclaimer,
   and a `/styleguide` page with contrast ratios. Routes for later phases show a "coming in Phase N" placeholder.

## First run

Requires Node 20.9 or newer.

```bash
npm install
npx playwright install chromium   # once, for the smoke tests
npm run fixtures:capture          # hits every NHL endpoint, saves fixtures/, writes fixtures/REPORT.md
npm run dev                       # http://localhost:3000 shows the endpoint report
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm run fixtures:capture` | Save one response per endpoint to `fixtures/v1/...` (add `-- --history` for every season since 1979-80) |
| `npm run themes:build` | Regenerate `styles/themes.css` after editing colours in `lib/theme/tokens.ts` |
| `npm run worker` | Scheduled jobs (a heartbeat for now) |
| `npm test` | Vitest unit tests (offline) |
| `npm run test:e2e` | Playwright smoke test: every page in all three themes, desktop and phone |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

`NHL_API_BASE` can point the capture script at another host (used for a mock server in testing).

## Layout

```
app/            routes
components/     ui/, game/, charts/, rink/, theme/
lib/nhl/        endpoint list (typed client + Zod schemas in Phase 3)
lib/sim/        playoff Monte Carlo (Phase 6)
lib/history/    On This Day builder (Phase 7)
lib/milestones/ milestone math (Phase 6)
db/             Drizzle schema + sqlite file (Phase 3)
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
