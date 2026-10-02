# Next features: team pages, shift data (lines, on-ice impact, player ratings), playoff odds

Agreed with Josh on 2 October 2026. Build in the order below and **stop for his review after each
step**. Explain results in plain language (he isn't a developer).

## Constraints (unchanged)

- $0 to run: static export, rebuilt by GitHub Actions three times a day (see `CLAUDE.md`).
- Free NHL data only. Everything is computed during `npm run update` / `npm run build`.
- **This season only** for every team and player view (last season stays only where it already is).
- Keep the home page simple; don't add a sixth main nav item (phone bottom nav).
- Keep each run polite and fast: new downloads only for new games.

## Where everything goes

| Feature | Where |
| --- | --- |
| Playoff odds | Home snapshot (beside points pace / magic number); new **Playoff race** view on Standings (all teams' odds + projected points; chart of Oilers' odds over the season) |
| Player ratings (game score out of 10) | Game report: "Most dangerous shooters" becomes **Player ratings** for both teams (rating, raw Game Score, TOI, shots, on-ice shot share; sortable; top performers highlighted). Home "Last game": top 3 ratings. Player page: rating trend for the last 10 games + rating column in the game log |
| Lines and pairings | Players page gets tabs **Stats / Lines / Roster** (Roster = existing cards; keep `/roster` working or redirect via the tab). Lines tab: "Current lines" (most recent game) + every forward line and D pair with real minutes together, sortable by TOI, xGF%, CF%, GF/GA. Game report: **Lines used tonight** |
| On-ice impact | Players table gains on-ice xGF% and on-ice vs off-ice (relative) columns. Player page: **On-ice impact** section and **Most common linemates** |
| Team scouting pages | New `/team/[abbrev]` for all 32 teams: record, advanced stats with ranks, chance map, goalies, recent form, top players by ixG, playoff odds. Linked from Standings team names and a "Scout the [opponent]" link in the home pre-game breakdown. Edmonton's page doubles as "Oilers at a glance" |

## Step 1: team scouting pages

Mostly reuses what's already calculated (`leagueTable`, `basicRows`, heat maps, `goalieTable`,
`shooterTable`, recent form) for any team id. `generateStaticParams` over the 32 teams from
standings. Opponent player links go to NHL.com (`playerHref`) unless we build their page.

**Done when:** all 32 pages build, link from Standings and the pre-game breakdown, tests pass.

## Step 2: shift data → lines, on-ice impact, player ratings

**Data.** The NHL's free shift charts (who was on the ice when). Last known endpoint:
`https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=<gameId>` — **verify it still
works first** and tell Josh if it doesn't. Store shifts compactly (or store per-event on-ice player
lists), league-wide, for this season and last (last season is needed to calibrate ratings).
Add to `npm run update` the same way play-by-play is ingested; backfill once.

**On-ice stats.** For each shot attempt / goal at 5-on-5, credit the skaters on the ice: CF/CA,
xGF/xGA (our model), GF/GA, plus 5-on-5 TOI. Lines = the same three forwards together; pairs =
the same two defencemen. Show only combinations above a minimum TOI (e.g. 20 min season, any
amount for a single game). Relative = team's numbers with him on vs off the ice.

**Game Score** (Dom Luszczyszyn, 2016), standard version for skaters:

| Event | Weight |
| --- | --- |
| Goal | +0.75 |
| Primary assist | +0.70 |
| Secondary assist | +0.55 |
| Shot on goal | +0.075 |
| Blocked shot | +0.05 |
| Penalty drawn / taken | +0.15 / −0.15 |
| Faceoff won / lost | +0.01 / −0.01 |
| 5v5 on-ice shot attempt for / against | +0.05 / −0.05 |
| 5v5 on-ice goal for / against | +0.15 / −0.15 |

Goalies: based on goals saved above expected (our model) instead of the original
−0.75 GA / +0.1 saves, scaled into a comparable range.

**Rating out of 10.** Rank each Game Score against the distribution of all NHL skater games from
the last two seasons (goalies against goalie games), then map the percentile to 1–10 with one
decimal, soccer-app style:

| Rating | Meaning | Approx. share of games |
| --- | --- | --- |
| 9.0–10 | Exceptional | top 1–2% |
| 8.0–8.9 | Excellent | top 5% |
| 7.0–7.9 | Very good | top 15–20% |
| 6.0–6.9 | Good | above average |
| 5.0–5.9 | Average | middle |
| below 5 | Rough game | bottom 20–25% |

Calibrate once per season (store the cut-offs, e.g. in a JSON file like `xg-model.json`), so a
rating means the same thing all season. Before finishing, show Josh a few memorable Oilers games
from last season with their ratings so he can sanity-check the cut-offs. Explain Game Score and
the rating in the stats guide; show the raw Game Score next to the rating.

**Done when:** lines, on-ice impact and ratings appear in all the places above; backfill done;
the update step stays a few minutes; tests pass.

## Step 3: playoff odds

Each build, simulate the rest of the season (e.g. 10,000 runs) from each team's strength (e.g.
xGF% / goal differential blended, regressed toward average early in the season) and the remaining
schedule, including OT/shootout points. Apply division top-3 + two wild cards per conference.
Save each build's Oilers odds so the chart can show them over time (in the database, saved with
it). Label everything as estimates. Show odds from the start of the season with a small-sample note
while fewer than ~10 games are played.

**Done when:** odds on the home snapshot, Playoff race view on Standings, odds-over-time chart,
explained in the stats guide; tests pass.
