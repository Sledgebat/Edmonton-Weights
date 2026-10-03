# Next features: Oilers Season In-Depth, a fan dashboard home page, and the missing stats

Agreed with Josh on 3 October 2026. Build in the four phases below and **stop for his review after
each phase**. Explain results in plain language (he isn't a developer) and give exact Terminal
commands when he needs to run something.

## Constraints (unchanged, see `CLAUDE.md`)

- $0 to run: static export, rebuilt by GitHub Actions three times a day. No server, no API routes.
- Free NHL data only. Heavy work happens in `npm run update` (saved in the database) or at build.
- **This season only** for every team and player view.
- Don't add a sixth main nav item (phone bottom nav).
- No NHL logos or headshots. Chart colours come from theme tokens.
- Be polite to the NHL: new downloads only where needed.
- `git pull` first; `npm run typecheck && npm run lint && npm test` (and `npm run test:e2e` for UI)
  before every push.
- **Write everything team-agnostic** (takes a team id or abbreviation, never assumes EDM). A
  league-wide version is planned later (`claude/league-expansion-notes.md` in the claude.ai
  project), and every team already has a `/team/[abbrev]` page.

## The two-page idea

- **Home page** = "tonight and right now", a fan dashboard. Each new feature adds at most one
  line or one compact card, and several only appear when they're relevant. It should end up about
  as long as it is today.
- **Season In-Depth page** = the deep dive. This is the existing `/team/[abbrev]` page, renamed
  and expanded: "Oilers Season In-Depth" for Edmonton, "[Team name] Season In-Depth" for everyone
  else (scouting pages get the same features automatically). Today nothing links to `/team/EDM`
  except Standings; the home page will link to it.

## Colour rules (apply everywhere, including every Season In-Depth page)

The home page's colour scheme is the standard for the whole site. Put the rules in one shared
helper (e.g. `lib/tone.ts`, moving `rankTone` out of `components/ui/RankPill.tsx` and `oddsTone`
out of `lib/stats/odds.ts`) and use it for every number, old and new:

| What | Green | Red | Plain |
| --- | --- | --- | --- |
| League rank | top half | bottom half | exactly the middle |
| Streak | W | L, OT | none |
| Playoff odds | above 50% | below 50% | 50% |
| Rating out of 10 | above 5.0 | below 5.0 | 5.0 |
| Plus/minus style values (goal diff, GSAx, G−ixG, rel. xGF%, points vs deserved...) | above 0 | below 0 | 0 |
| Trend arrows | better | worse | flat |

The Season In-Depth page doesn't follow this yet (e.g. the Record cards' streak and goal diff
are plain): fix that. On another team's page, green means good *for that team*.

Two deliberate exceptions: the **luck meter** gauge stays neutral (being lucky isn't "good"
play), and the **calendar** uses result colours for the letter and orange/blue shading for
control of play.

**Early-season ranks:** right now ranks are out of the teams with stored games ("1st / 2",
"5th / 15"), so the colours mislead. Show ranks and their colours only once every team in the
table has played at least one game; until then show a short note instead.

## Where everything goes

| Feature | Home page | Season In-Depth (`/team/[abbrev]`) | Elsewhere |
| --- | --- | --- | --- |
| What's at stake tonight | Next game strip | – | – |
| Head-to-head | Next game strip + pre-game breakdown | – | – |
| Luck meter | Small gauge beside the PDO tile | Full version + game-by-game chart | Stats Guide |
| PDO split (5v5 Sh%, Sv%) | Small print in the PDO tile | Own tiles | – |
| Team personality | Tag under the "Oilers 2026-27" heading | Full card with reasons | – |
| Comeback tracker | Last game badge when it applies | Situations tab | Game report summary |
| Stolen games | Last game badge when it applies | Goaltending tab | Goalie player pages, game report badge |
| Streak watch | "Hot and cold" card (tabs: Streaks / Shooting vs career) | – | – |
| Milestone watch | Strip, only when someone is close | – | Player pages |
| Season race chart | – | Overview tab | Standings → Playoff race |
| Season calendar | – | Link from Schedule tab | Games page, new Calendar tab |
| How they score | – | Scoring tab | – |
| Remaining schedule | – | Schedule tab (one summary) | Games page panel; Standings → Playoff race column |
| Situational records, goals by period | – | Situations tab | – |
| Special teams and discipline | – | Situations tab | – |
| Home/road, RW, OT/SO record | – | Overview record cards | Standings columns |
| Hits, blocks, giveaways, takeaways | – | Situations tab (team totals) | Players page tab |
| Player 5v5 P/60, primary points, FO%, penalties | – | – | Players page tabs |
| Goalie HD save %, quality starts | – | Goaltending tab | Players page goalie table |

Home links to the in-depth page: a "Oilers Season In-Depth →" link in the snapshot, and the
personality tag and luck gauge link to the matching part of it.

## Season In-Depth page layout

Keep the current header (team badge, name, division). Under it, tabs (`components/ui/ViewTabs.tsx`)
so the page doesn't become a wall on phones:

1. **Overview**: record cards (+ RW, home record, road record, OT record, SO record), personality
   card, luck meter (gauge + actual vs deserved points chart), race chart, team stat tiles (+ 5v5
   Sh% and Sv% tiles), recent form.
2. **Situations**: situational records, comebacks and blown leads, goals by period, special teams
   and discipline, hits/blocks/giveaways/takeaways.
3. **Scoring**: how they score, chance maps (existing), most dangerous shooters (existing).
4. **Goaltending**: goalies (existing) + HD save %, quality starts, really bad starts, stolen games.
5. **Schedule**: remaining schedule summary, link to the calendar on the Games page.

Most features need a sample before they mean anything: keep using `sampleNote`, and hide the
personality card and luck verdict until 10 games (show a short note instead).

---

## Phase 1: shared colours, tables and the new player data

Quick, visible wins, plus the one data change that gets harder the longer we wait.

1. **Colour rules** helper and early-season rank rule (above). Apply to every existing page.
2. **Standings**: add RW, GF, GA, Home (W-L-OTL) and Road (W-L-OTL) to the Division, Wild card and
   Conference tables (all in the standings feed: `regulationWins`, `goalFor`, `goalAgainst`,
   `homeWins`/`homeLosses`/`homeOtLosses`, `roadWins`...). Team column stays sticky; phones scroll
   sideways as today.
3. **Hits, giveaways, takeaways** at ingest. `lib/stats/shifts.ts` already walks every play to
   count blocks and faceoffs: add `hit` (`hittingPlayerId`), `giveaway` and `takeaway` (`playerId`)
   as new `player_games` columns (migration, default 0). Re-process this season's stored games so
   they get the new counts (only a few dozen games so far; finished games' play-by-play is kept in
   the cache). Last season stays without them ("—"). Stats Guide caveat: hit and giveaway counts
   vary a lot by arena scorekeeper.
4. **Players page tabs** on the Stats view (keep the season switch): **Scoring** · **Advanced** ·
   **Physical & discipline**. Name and GP stay pinned.
   - Scoring: GP, G, A, P, primary points (G + first assists), +/-, SOG, S%, TOI.
   - Advanced: 5-on-5 points per 60, ixG, HD, G−ixG, on-ice xGF%, rel xGF%.
   - Physical & discipline: FO% (with FOW–FOL in the tooltip, centres only), penalties drawn,
     taken and the difference, blocks, hits, giveaways, takeaways.
   - 5-on-5 points: join `goals` to `shots` on (game_id, event_id) where `strength = '5v5'` for the
     scorer, first and second assist; 5-on-5 TOI is `player_games.toi5`. No new downloads.
5. **Goalie table** additions: HD save % (`goalieSeasons` already computes HD faced/goals),
   quality starts and QS %, really bad starts, stolen games (Phase 2 definition).
   - Starter of a game = the goalie who faced his team's first shot on goal against.
   - Per-game shots against and goals from `shots` (exclude empty net).
   - Quality start (Rob Vollman): save % at or above the league's average that season, or at
     least .885 with 20 or fewer shots. Really bad start: save % below .850.

**Done when:** colours are consistent on every page, standings and players tables show the new
columns, this season's games have hits/giveaways/takeaways, tests pass.

## Phase 2: Oilers Season In-Depth

1. **Rename and restructure** `/team/[abbrev]` with the tabs above; metadata titles to match. The
   nav can keep highlighting Standings for other teams; consider Home for EDM.
2. **Game script** (`lib/stats/situations.ts`): replay each game from the `goals` table (score
   before every goal, period) plus `stats_games` (final, OT/SO). Per team per game: who scored
   first, score after the 1st and 2nd, biggest lead and deficit, final margin, empty-net goals.
   This one function feeds:
   - record when scoring first / allowing first; when leading / trailing after 1 and after 2;
   - one-goal games (final margin 1, or 2 with an empty-net goal);
   - goals for and against by period (1, 2, 3, OT);
   - comebacks: wins after trailing by 2+, biggest comeback, wins when trailing after 2;
   - blown leads: losses (incl. OT/SO) after leading by 2+, or leading after 2.
   - Home/road record and OT/SO record from the standings feed; home/road 5v5 xGF% from `shots`
     (`is_home`).
   League ranks where they make sense (it works for every team).
3. **Special teams and discipline**: PP goals and SH goals for/against (`shots`, strength PP/SH),
   PP time per game (`strength_time`), PP xG/60 and PK xGA/60 (existing), penalties drawn, taken
   and differential (sum of `player_games.pd/pt`). Power-play opportunities aren't in the team
   summary feed: check whether the NHL stats report `team/powerplay` has them, otherwise count from
   penalty events, otherwise leave them out and tell Josh.
4. **Luck meter** (`lib/stats/luck.ts`): for each game, the exact chance of every final score from
   its shots (each unblocked shot scores with probability = its xG; add them up with a simple
   running-distribution calculation, no simulation). Leave out empty-net shots. Then
   P(regulation win), P(tie after regulation), P(regulation loss) → deserved points =
   2 × P(win) + 1.5 × P(tie). Season sum vs actual points (W 2, OT/SO loss 1). League table → rank.
   - Gauge: semicircle, needle at actual − deserved points (clip at ±10), labels "Unlucky" /
     "Lucky", neutral colours. Under it: "14 points · deserved 17".
   - Verdict sentence combining the gap and PDO, e.g. "3 points worse than they deserved, and
     shooting 6.8% at 5-on-5. Should improve."
   - Full version: gauge plus a game-by-game chart of cumulative actual vs deserved points.
   - Stats Guide entry; note it ignores score effects (teams protecting leads).
5. **Personality card** (`lib/stats/personality.ts`): 8–10 types with rules over ranks the site
   already has (xGF/60, xGA/60, CF%, HDCF%, GSAx, PDO, PP%, PK%, luck, penalty differential).
   Examples: Run-and-gun, Shutdown, Puck hogs, Goalie carrying them, Unlucky (better than the
   record), Living dangerously (record better than the play), Special-teams merchants, Built for
   the playoffs (good 5v5 both ways), Middle of the pack (fallback). Show the best match (plus an
   optional second). Tune thresholds against last season's 32 teams so the labels spread sensibly,
   and show Josh the result before finishing. Card: label, one-sentence blurb, three reasons with
   rank pills. Hidden until 10 games.
6. **How they score**: from `shots` (regular season, not empty net), each team's share of goals
   and xG by origin (rush, rebound, everything else), by shot type, and by strength (5v5, PP, SH),
   next to the league average. Horizontal bars; ranks where meaningful (e.g. rush xG per 60).
7. **Goaltending tab**: Phase 1 goalie stats per goalie, plus **stolen games**: a win where the
   goalie's GSAx in that game (`player_games.gsax`) is 2.0 or more. Check the cut-off against last
   season first (a typical starter should have a handful, not dozens) and show Josh. List each
   stolen game (date, opponent, GSAx, link to the report).
8. **5v5 shooting % and save %** tiles (already computed inside PDO in `lib/stats/team.ts`).

**Done when:** the tabs work on phone and desktop in light and dark, every number follows the
colour rules, EDM and a few other teams look right, Stats Guide entries written, tests pass.

## Phase 3: the home page dashboard

1. **What's at stake tonight** (`lib/stats/odds.ts`). In `npm run update`, when the next Oilers
   game is an unplayed regular-season game, run the simulation three more times with that game
   forced: **win** (2 points, counts as a regulation win), **OT loss** (Oilers 1, opponent 2),
   **regulation loss** (opponent 2, regulation win). Use the same seed as the main run and keep the
   number of random draws identical (draw as usual, then override that game's result), so the
   difference comes from the game, not chance. Save in a small `stakes` table (run time, game id,
   team, odds now, if win, if OT loss, if loss). Shown in a thin strip under the Next game bar:
   **Win → 62% · OT loss → 56% · Loss → 51%**, coloured with the odds rule. Write it for any team
   (the league version will want all 32), but only run it for EDM for now. Unit test: win ≥ OT
   loss ≥ loss.
2. **Head-to-head**, in the same strip: this season's regular-season meetings with tonight's
   opponent from the schedule, e.g. "Season series 1-0-1 · 2 meetings left". No meetings yet:
   "First of 4 meetings". The pre-game breakdown lists each meeting (date, score, xG, link).
3. **Last game badges**, only when they apply: comeback ("Came back from 2 down") and stolen game
   ("Stolen by Jarry, +2.4 GSAx"). Same notes in the game report's summary.
4. **Luck gauge** (small) beside the PDO tile in "Team stats at a glance"; the PDO tile stays and
   gets 5v5 Sh% and Sv% in small print. Gauge links to the in-depth Overview.
5. **Personality tag** under the "Oilers 2026-27" heading, linking to the in-depth card, plus the
   "Oilers Season In-Depth →" link in the snapshot.
6. **Hot and cold** card replacing the "Shooting vs career" box, same footprint, two tabs:
   - **Streaks** (default): current point streaks of 3+ games, goal streaks of 2+, and the longest
     active goalless and pointless droughts among regulars (10+ GP). For Oilers players use their
     game logs (already downloaded for player pages) so a game whose shift data isn't published
     yet still counts. (League version later: `player_games`, with that caveat handled.)
   - **Shooting vs career**: today's box, unchanged.
7. **Milestone watch**: from each Oilers player's `careerTotals.regularSeason` (games, goals,
   assists, points; goalies: games, wins, shutouts) and, for "with the Oilers" milestones, their
   `seasonTotals` rows for EDM in the NHL. Round-number milestones (e.g. games every 100; goals
   every 50; points and assists every 100; wins every 50; shutouts every 10). Show when within
   reach (e.g. 10 points, 5 goals, 10 games, 5 wins); at most 3 on the home strip, which is hidden
   when nobody is close. Player pages get a "Next milestone" line.

**Done when:** the home page has all of the above and is about the same length, nothing new
appears when it doesn't apply, tests pass. **Then pause: Josh tests with Oilers fans before
Phase 4.**

## Phase 4: charts and the schedule

1. **Season race chart.** In `simulate()`, also record each conference's cut line per run (points
   of the last team in), and save the average with each odds run. Chart: the team's points game by
   game (from `stats_games`; W 2, OT/SO loss 1) against a straight pace line to the projected cut
   line at the end of the season. Standings → Playoff race (next to the odds-over-time chart) and
   the in-depth Overview tab.
2. **Season calendar**, a new **Calendar** tab on the Games page. Month grids, one square per game:
   result letter (W, L, OTL, SOL) coloured like `ResultBadge`, background shaded by that game's
   expected-goals share (orange = Oilers controlled play, blue = opponent, from theme tokens), with
   a legend. Future games as outlined squares with the opponent's abbreviation. Tap a played game
   to open its report.
3. **Remaining schedule.** In `npm run update` (the full league schedule is only loaded there),
   for every team: average strength of remaining opponents (the odds model's strength) ranked
   1–32 (1 = easiest), back-to-backs left, home and road games left, longest road trip left. Save
   with each run. Shown as a panel above upcoming games on the Games page, a column in Standings →
   Playoff race, and a summary on the in-depth Schedule tab.

**Done when:** charts and calendar work on phone and desktop in light and dark, tests pass.

---

## Every phase

- Unit tests for every new calculation (luck distribution, game script, stakes, quality starts,
  streaks, milestones, personality rules) and the e2e smoke test for new pages and tabs.
- A Stats Guide entry for every new stat, in plain language.
- Update `CLAUDE.md` (product decisions, new tables, new commands) and the README if commands
  change.
- Keep `npm run update` fast: say how long it took before and after.
