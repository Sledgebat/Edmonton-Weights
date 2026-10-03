@AGENTS.md

# EdmontonWeights: notes for Claude

Edmonton Oilers stats site, basic and advanced, built from the NHL's free public data with our own
expected-goals model. Owner: Josh. He is not a developer: explain changes in plain language, give
exact Terminal commands when he needs to run something, and don't assume he knows git or npm.
Independent fan site; the footer disclaimer must stay on every page.

## How the site runs (don't break this)

- **Static site, free hosting.** `next.config.ts` uses `output: "export"`: every page is pre-built
  into `out/`. There is no server. No API routes, no `searchParams`, no `connection()`, no
  cookies/headers, no server actions. Dynamic routes need `generateStaticParams` and
  `dynamicParams = false`.
- **Published by GitHub Actions** (`.github/workflows/update-site.yml`) to GitHub Pages at
  https://sledgebat.github.io/Edmonton-Weights/ (repo `Sledgebat/Edmonton-Weights`, public).
  Runs ~11:20 p.m., 3:15 a.m. and 9 a.m. Edmonton time, on every push to `main`, and from
  "Run workflow". Steps: download saved DB → `npm run update` (adds new games) → `npm run build`
  → save DB → deploy.
- **The stats database** (SQLite) lives between runs as `edmontonweights.sqlite.gz` on the repo's
  `data` release. Never delete that release. Locally it's `db/edmontonweights.sqlite` (git-ignored).
- **Base path.** On Pages the site lives under `/Edmonton-Weights`; the workflow passes it as
  `NEXT_PUBLIC_BASE_PATH`. Use `next/link` for internal links (it adds the base path); never
  hard-code `href="/..."` on a plain `<a>`.
- **Views that used to use the URL** (standings view, schedule filter, Players season) are
  `components/ui/ViewTabs.tsx`: all panels are built into the page and switched in the browser.
- **Player pages** exist only for current and recent Oilers (`lib/site.ts`); other players link to
  NHL.com via `playerHref`. Game pages exist for every Oilers game this season. Team scouting
  pages (`/team/EDM` etc., `lib/team.ts`) exist for every team in the standings. The Players
  page has Stats / Lines / Roster tabs; `/roster` still works on its own.
- **NHL client** (`lib/nhl/client.ts`): validates every response with Zod, caches in SQLite,
  limits parallel requests politely, and bypasses Next's patched `fetch` (needed for static export).
- GitHub pauses scheduled workflows after 60 days without commits; the workflow makes an empty
  commit every ~45 days. So **always pull before working** (`git pull`), since GitHub may have
  added commits.

## Product decisions (Josh's calls)

- **This season only** everywhere: no falling back to or blending with last season (the roster
  turned over). Small samples get a plain note instead (`sampleNote` in `lib/home.ts`). Last
  season is only on the Players page season switch and players' season-by-season tables.
- **Home page:** snapshot (record, points pace, playoff magic number from game 41, estimate),
  Next game with a **collapsed "Pre-game breakdown"** (tale of the tape, keys, recent form,
  chance maps, goalie matchup with *all* goalies on both rosters, since starters aren't known),
  Last game (links to the game report), team stat tiles with ranks and last-10 trends, recent
  performance, leaders, NHL EDGE.
- **Playoff odds** (`lib/stats/odds.ts`): 10,000 seeded simulations of the rest of the regular
  season, run in `npm run update` and saved per run in `playoff_odds` (history = the chart).
  Shown green above 50%, red below, plain at 50%; never "0%" or "100%". The season is **84
  games from 2026-27**: lengths come from the schedule (`seasonGamesOf`), not a constant.
- **Tale of the tape** has no single-player stats. Pace of play = 5-on-5 shot attempts per 60 by
  both teams in that team's games (rank 1 = fastest). Speed bursts are per game and **ranked by
  us** across the league (`lib/edge.ts`), not the NHL's season-total rank.
- **NHL EDGE tiles** for top speed, hardest shot and speed bursts open a ranked list of every
  Oilers skater.
- **Chance maps** show where a team is *above the league average*, not raw volume.
- **No NHL logos or headshots** (trademarks/photos). Teams show as abbreviation badges.
- Theme: Oilers blue and orange only, light/dark mode. Chart colours come from theme tokens
  (`--chart-us` orange, `--chart-them` blue).
- **Clutch Score** (`lib/stats/clutch.ts`): a fun stat, set apart in orange (`.clutch-card`), never
  labelled "fun stat". Last 10 min of the 3rd or OT, within one goal: OT winner 3, tying 2 (2.5 goalie
  pulled), go-ahead 2, insurance 0.5 (0 empty net); A1 70%, A2 50%; playoffs ×1.5. League-wide.
  Home: Oilers top 3 under Leaders; `/clutch` lists every player with a clutch point (30/50/100/All
  per page), Oilers marked. Not in the main nav.
- **Colour rules** (`lib/tone.ts`, one helper for every page): green = good, red = bad, plain =
  neutral. Ranks top/bottom half; streak W vs L/OT; odds vs 50%; ratings vs 5.0; plus/minus values
  vs 0 (judged on the number shown); trends better/worse. On another team's page green = good for
  that team. Exceptions (later phases): luck meter neutral, calendar uses result colours.
- **Early-season ranks:** league ranks (tiles, tale of the tape, EDGE) are hidden until every team
  in the standings has a stored game (`LeagueContext.ranksReady`); a short note shows instead.
- **Players page** Stats view: skater table in three tabs (Scoring · Advanced · Physical &
  discipline, `?stat=`), GP in each; goalie table adds HDSV%, quality starts (Vollman), really bad
  starts (< .850) and stolen games (win with game GSAx ≥ 2), from `lib/stats/goalies.ts` (starter
  = goalie who faced his team's first shot on goal). 5v5 P/60 needs the `goals` table, so it's
  "—" for 2025-26. Standings tables show RW, GF, GA, Home and Road records.
- No live in-game updates (would need a paid server); game pages for live games say they're a
  snapshot and link to NHL.com. Cost must stay at $0.

## Stats engine

- Shots come from play-by-play (`lib/stats/extract.ts`), normalised so the shooter attacks +x.
  High danger = unblocked shot from the inner slot, or a rebound from the slot.
- Our xG model: logistic regression, 30 features + empty-net model (`lib/stats/xg.ts`,
  `xg-model.json`, report in `xg-report.md`). Held-out AUC 0.754. Retrain each summer with
  `npm run xg:train` then `npm run stats:rescore` (optional; nothing breaks if skipped).
- Rates are per 60; ranks: 1 = best. GSAx = xGA − GA.
- **Shift data** (`lib/stats/shifts.ts`): NHL shift charts matched to the play-by-play at ingest.
  Only results are stored (`player_games`: TOI, 5-on-5 on-ice CF/GF/xGF, Game Score per player
  per game; `unit_games`: lines/pairs with ≥ 30 s together in a game), never raw shifts.
  `npm run update` adds them for new games and catches up any missing (capped at 25 min a run).
  `player_games.hits/giveaways/takeaways` exist from 2026-27 only (null before = "—"); arena
  scorekeepers count them very differently.
- **Goals** (`goals`, `goal_status`, `player_names` tables): every goal with the score before it,
  stored at ingest; `npm run update` catches up any game of this season without them.
- **Ratings out of 10** (`lib/stats/ratings.ts`): Game Score ranked against the two previous
  seasons, cut-offs in `rating-model.json`. Re-run `npm run ratings:calibrate` each summer
  (after the season rolls over), with `npm run shifts:backfill` first if a season is missing.

## Commands

| Command | What |
| --- | --- |
| `npm run dev` | Local site with live NHL data at http://localhost:3000 |
| `npm run update` | Add new games (and their shift charts) to the local database |
| `npm run shifts:backfill` | One-time: shift charts for every stored season |
| `npm run ratings:calibrate` | Each summer: set the rating cut-offs for the new season |
| `npm run build && npm run preview` | Build and view exactly what gets published |
| `npm run fixtures:capture` | Save NHL responses for offline mode (`NHL_MODE=fixtures`) |
| `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` | Checks |

e2e tests run offline against fixtures (`NHL_MODE=fixtures`, `db/e2e.sqlite`) and the static
build. If Playwright's browser is missing: `npx playwright install chromium`.

## Before pushing

1. `git pull` first.
2. `npm run typecheck && npm run lint && npm test` (and `npm run test:e2e` for UI changes).
3. Commit with a clear message and push to `main`; the site rebuilds in a few minutes. Check the
   Actions tab for a green check.

## Known follow-ups

- **Next features plan:** `docs/next-features.md`: all three steps built (team pages, shift data,
  playoff odds), October 2026.
- **Season In-Depth plan:** `docs/season-in-depth-plan.md`, four phases, stop for Josh's review
  after each. Phase 1 (colours, standings columns, hits/giveaways/takeaways, Players tabs, goalie
  starts) built 3 Oct 2026.

- Playoffs: games are stored, but pages are built around the regular season. Review before April.
- Step 5 polish from the plan (accessibility pass, mobile check) is not finished.
- Plan docs live in Josh's Obsidian vault ("Oilers Stats Site — Plan.md"), not in this repo.
