import type { Metadata } from "next";
import Link from "next/link";
import { currentModel } from "@/lib/stats/xg";
import { MIN_CAREER_SHOTS } from "@/lib/shooting";
import { GAME_SCORE } from "@/lib/stats/shifts";
import { RATING_ANCHORS, ratingModel } from "@/lib/stats/ratings";
import { CLUTCH } from "@/lib/stats/clutch";
import { seasonLabel } from "@/lib/nhl/endpoints";
import { BAD_START_SV, QS_SMALL_SHOTS, QS_SMALL_SV, STOLEN_GSAX } from "@/lib/stats/goalies";
import { MIN_P60_SECONDS, PHYSICAL_FROM_SEASON } from "@/lib/stats/skaters";
import { FALLBACK, TYPES } from "@/lib/stats/personality";
import { SMALL_SAMPLE_GAMES } from "@/lib/home";
import { HOME_MILESTONES } from "@/lib/dashboard";
import { DROUGHT_MIN, GOAL_STREAK_MIN, POINT_STREAK_MIN, REGULAR_GP } from "@/lib/streaks";

export const metadata: Metadata = { title: "Stats guide", description: "What every stat on EdmontonWeights means, and how our expected-goals model works." };

type Holdout = { testSeason: number; shots: number; goals: number; expectedGoals: number; logLoss: number; baselineLogLoss: number; auc: number; calibration: { predicted: number; actual: number; shots: number }[] };
type Metrics = { trainingShots?: number; trainingGoals?: number; seasons?: number[]; holdout?: Holdout };

const TERMS: { id: string; term: string; short: string; body: React.ReactNode }[] = [
  {
    id: "corsi",
    term: "Shot attempts (Corsi, CF%)",
    short: "Every shot aimed at the net: on goal, missed or blocked.",
    body: (
      <>
        Shot attempts are a stand-in for puck possession: the team that has the puck more shoots more. <strong>CF%</strong> is a team&apos;s share of all attempts while it&apos;s on the ice. 50% is even; 55% is very good. We use 5-on-5 so power plays don&apos;t skew it.
      </>
    ),
  },
  {
    id: "fenwick",
    term: "Unblocked attempts (Fenwick)",
    short: "Shot attempts minus the blocked ones.",
    body: <>Blocked shots have no reliable location (the NHL records where the block happened), so our expected-goals model and shot maps use unblocked attempts only.</>,
  },
  {
    id: "xg",
    term: "Expected goals (xG, ixG, xGF%)",
    short: "How many goals the chances were worth, on average.",
    body: (
      <>
        Every unblocked shot gets a probability of going in, based on where it came from and what happened just before (details below). A shot from the slot might be worth 0.15 goals; a point shot through traffic 0.03. Add them up and you get a team&apos;s <strong>xG</strong>. <strong>ixG</strong> is a single player&apos;s own shots. <strong>xGF%</strong> is a team&apos;s share of the expected goals in its games: the best single measure of who&apos;s controlling play. <strong>G−ixG</strong> shows finishing: above zero means scoring more than the chances suggest (skill, or luck that may not last).
      </>
    ),
  },
  {
    id: "hd",
    term: "High-danger chances (HD)",
    short: "Shots from right in front of the net, plus rebounds from the slot.",
    body: (
      <>
        An unblocked shot from the inner slot (an 18-foot-wide strip straight out from the net, up to 20 feet from the goal line), or a rebound from anywhere in the slot. These go in several times as often as other shots. <strong>HDCF%</strong> is a team&apos;s share of them.
      </>
    ),
  },
  {
    id: "pdo",
    term: "PDO",
    short: "5-on-5 shooting % plus save %. Roughly a luck meter.",
    body: <>League average is 100 (as in 1.000). Teams well above 100 are usually getting bounces that tend to even out; teams well below are usually due for better luck. Elite shooters or goalies can hold it a point or two above 100.</>,
  },
  {
    id: "gsax",
    term: "Goals saved above expected (GSAx)",
    short: "Expected goals faced minus goals allowed.",
    body: <>The fairest single goalie number: it accounts for how hard the shots were. +10 over a season is excellent; below zero means letting in more than an average goalie would on the same shots.</>,
  },
  {
    id: "xsv",
    term: "Expected save % (xSV%)",
    short: "The save % an average goalie would post on the same shots on goal.",
    body: <>Compare it with the real save %. A goalie at .905 behind a team that allows lots of slot chances (xSV% .895) is doing better than one at .910 behind a tidy defence (xSV% .915).</>,
  },
  {
    id: "per60",
    term: "Per 60 (CF/60, xGF/60)",
    short: "A rate per 60 minutes of play at that strength.",
    body: <>Lets you compare teams that have played different amounts of 5-on-5 or power-play time.</>,
  },
  {
    id: "strength",
    term: "Strength (5v5, PP, SH, EV)",
    short: "How many skaters each side had when the shot happened.",
    body: <>5v5 is full strength. PP is a power play (more skaters than the opponent); SH is shorthanded. &ldquo;Other&rdquo; covers 4-on-4, 3-on-3 overtime and empty nets. Most analysis uses 5v5 because special teams follow different patterns.</>,
  },
  {
    id: "rebound",
    term: "Rebound",
    short: "A shot within 3 seconds of a teammate's shot on goal, with no stoppage.",
    body: <>Rebounds are much more dangerous than first shots because the goalie is out of position.</>,
  },
  {
    id: "rush",
    term: "Rush shot",
    short: "A shot within 4 seconds of play outside the offensive zone.",
    body: <>Off-the-rush chances catch a defence before it&apos;s set up.</>,
  },
  {
    id: "on-ice",
    term: "On-ice and relative (On-ice xGF%, Rel xGF%)",
    short: "How the team does with a player on the ice, and how that compares with him on the bench.",
    body: (
      <>
        From the NHL&apos;s shift charts we know who was on the ice for every 5-on-5 shot. <strong>On-ice xGF%</strong> is the Oilers&apos; share of expected goals while he&apos;s out there. <strong>Relative</strong> (Rel) subtracts the team&apos;s share in the same games while he&apos;s off the ice: +3 means the Oilers control 3 points more of the play with him on. Relative numbers help separate a player from his team, but linemates and the minutes a coach gives him still shape them.
      </>
    ),
  },
  {
    id: "primary-points",
    term: "Primary points (P1) and 5-on-5 points per 60",
    short: "Goals plus first assists; and how often a player scores at full strength.",
    body: (
      <>
        A second assist is often a pass several touches before the goal, so <strong>primary points</strong> (goals plus first assists) say more about who
        drives the scoring. <strong>5v5 P/60</strong> is points at 5 on 5 per 60 minutes of 5-on-5 ice time: it puts a third-liner and a top-liner on the
        same footing, and leaves out power-play points. It appears once a player has {MIN_P60_SECONDS / 60} minutes at 5 on 5.
      </>
    ),
  },
  {
    id: "physical",
    term: "Physical and discipline (FO%, penalties, hits, giveaways, takeaways)",
    short: "Faceoffs, penalties drawn and taken, and the scorekeeper's hits, giveaways and takeaways.",
    body: (
      <>
        <strong>FO%</strong> is faceoffs won, shown for centres only (hover for won and lost). <strong>Penalties drawn minus taken</strong> above zero
        means a player earns his team more power plays than he gives away. <strong>Hits</strong>, <strong>giveaways</strong> (losing the puck to the
        other team) and <strong>takeaways</strong> (winning it back) are logged by each arena&apos;s scorekeeper, and some rinks count far more than
        others, so compare players on the same team rather than across the league. We have them from {seasonLabel(PHYSICAL_FROM_SEASON)}; earlier
        seasons show &ldquo;—&rdquo;. A lot of giveaways often just means a player has the puck a lot.
      </>
    ),
  },
  {
    id: "goalie-starts",
    term: "Quality starts, really bad starts and stolen games",
    short: "Game-by-game goalie measures: how often he gives his team a chance to win.",
    body: (
      <>
        A goalie&apos;s <strong>start</strong> is a game where he faced his team&apos;s first shot on goal. A <strong>quality start</strong> (QS, from Rob
        Vollman) is a start with a save % at or above the league&apos;s average that season, or at least {QS_SMALL_SV.toFixed(3).replace(/^0/, "")} on{" "}
        {QS_SMALL_SHOTS} shots or fewer; around 55–60% of starts is typical for a regular starter. A <strong>really bad start</strong> (RBS) is a save %
        below {BAD_START_SV.toFixed(3).replace(/^0/, "")}. A <strong>stolen game</strong> is a win where he saved {STOLEN_GSAX} or more goals above
        expected that night, and at least as many as the winning margin (empty-net goals aside): the team probably loses without him. A blowout
        he starred in doesn&apos;t count. A typical starter has a handful a season. <strong>HDSV%</strong> is save % on
        high-danger shots. Empty-net goals don&apos;t count against anyone.
      </>
    ),
  },
  {
    id: "luck",
    term: "Luck meter (points vs deserved)",
    short: "How many points a team has banked compared with what its chances deserved.",
    body: (
      <>
        For every game we take each unblocked shot in regulation and treat it as landing with a chance equal to its expected goals. Adding those up
        shot by shot gives the exact chance of every final score (no simulation), and from that the chance of winning in regulation, going to overtime
        tied, or losing. <strong>Deserved points</strong> = 2 × the chance of a regulation win + 1.5 × the chance of a tie (a tie gives each team a point
        plus a coin flip for the extra one). Real games end tied more often than independent shots suggest, so tie chances are scaled up to match how
        often games actually go to overtime that season. The gauge shows points banked minus points deserved: right of centre is lucky, left is
        unlucky, and it&apos;s grey on purpose, because being lucky isn&apos;t the same as playing well. Empty-net shots and overtime are left out, and
        it ignores score effects (a team protecting a lead gives up more chances than usual). The verdict appears after {SMALL_SAMPLE_GAMES} games and
        uses <a href="#pdo" className="underline">PDO</a> to say whether things should even out.
      </>
    ),
  },
  {
    id: "personality",
    term: "Team personality",
    short: "A one-line label for how a team plays, from where it ranks in the league.",
    body: (
      <>
        Each label is a couple of conditions on league ranks, for example <strong>Run-and-gun</strong>: top 10 in 5-on-5 expected goals for per 60
        and bottom 12 in expected goals against. The closer a team is to the top (or bottom) of each, the stronger the match, and the strongest match
        wins; a second strong match is mentioned too. The labels: {TYPES.map((t) => t.label).join(", ")}, and {FALLBACK.label.toLowerCase()} when
        nothing stands out. The three reasons underneath are the ranks behind it. Labels appear after {SMALL_SAMPLE_GAMES} games, once every team has
        played. We tuned the thresholds on 2024-25 and 2025-26 so the 32 teams spread across them.
      </>
    ),
  },
  {
    id: "situations",
    term: "Records by situation, comebacks and blown leads",
    short: "How a team does depending on the score: scoring first, leading after two, one-goal games.",
    body: (
      <>
        We replay every game goal by goal. Records are wins-losses-OT/shootout losses; the league rank compares point % (points won out of points
        available) in that situation. <strong>One-goal games</strong> are decided by one goal (shootouts included) or by two with an empty-net goal.
        A <strong>comeback win</strong> is a win after trailing by two or more at any point; a <strong>blown lead</strong> is a loss (including in
        overtime or a shootout) after leading by two or more. Shootout goals don&apos;t count as goals by period.
      </>
    ),
  },
  {
    id: "special-teams",
    term: "Special teams and discipline",
    short: "Power plays, penalty kills, and penalties drawn and taken.",
    body: (
      <>
        Power-play opportunities, times shorthanded and power-play and shorthanded goals come from the NHL&apos;s team reports (they count a
        power-play goal scored with the goalie pulled for an extra attacker). Power-play time comes from the play-by-play, and penalties drawn and
        taken from the players&apos; games. Most of these are per game so teams with games in hand compare fairly. Hits, blocks, giveaways and
        takeaways are ranked by volume and shown without green or red: more hits isn&apos;t clearly better, and scorekeepers count them differently.
      </>
    ),
  },
  {
    id: "how-they-score",
    term: "How they score",
    short: "Where a team's goals and expected goals come from, against the league average.",
    body: (
      <>
        Every goal and unblocked shot is sorted three ways: where the chance came from (off the rush, a rebound, or everything else), shot type, and
        strength. Bars compare the team&apos;s share of its own expected goals with the league&apos;s share. The NHL&apos;s play-by-play rarely
        records the play just before a team carries the puck into the zone, so only the clearest rush chances are caught (about 1 shot in 100).
      </>
    ),
  },
  {
    id: "lines",
    term: "Lines and pairs",
    short: "The same three forwards, or two defencemen, on the ice together at 5 on 5.",
    body: (
      <>
        Built from who was actually on the ice, second by second, not from the posted lineup. &ldquo;Current lines&rdquo; are the groups that played the most together in the latest game. Season tables show every combination with at least 20 minutes together, since a few shifts tell you little.
      </>
    ),
  },
  {
    id: "odds",
    term: "Playoff odds",
    short: "How often a team makes the playoffs when we play out the rest of the season 10,000 times.",
    body: (
      <>
        At every site update we simulate every remaining regular-season game, 10,000 times over. Each game&apos;s winner is drawn at random, weighted by the
        two teams&apos; strength (60% their expected-goals share this season, 40% their actual goal share), with a small edge for the home team and about
        one game in four going to overtime, where the loser still gets a point. Early in the season each team&apos;s strength is pulled toward average and
        allowed to vary between simulations, because a few games can&apos;t tell us how good a team really is. Each simulated season ends with the NHL&apos;s
        format (top three in each division plus two wild cards per conference) and we count how often each team gets in. <strong>Projected points</strong>{" "}
        is the average final total. The odds are <strong>green above 50%</strong> and <strong>red below</strong>. They&apos;re estimates: injuries,
        trades and the NHL&apos;s later tiebreakers aren&apos;t modelled, and they move a lot in the first few weeks.
      </>
    ),
  },
  {
    id: "stakes",
    term: "What's at stake tonight",
    short: "The Oilers' playoff odds after a win, an overtime loss or a regulation loss in their next game.",
    body: (
      <>
        At each update we run the playoff simulation three more times with the next game&apos;s result fixed: a win (two points, counted as a
        regulation win), an overtime or shootout loss (one point; the opponent gets two) and a regulation loss. Everything else is drawn exactly as in
        the main run, so the differences come from that one game. Colours follow the odds: green above 50%, red below.
      </>
    ),
  },
  {
    id: "streaks",
    term: "Hot and cold: streaks and droughts",
    short: "Who's on a point or goal streak, and who's in the longest drought.",
    body: (
      <>
        From each player&apos;s NHL game log this season. A point streak needs {POINT_STREAK_MIN}+ games in a row with a point, a goal streak{" "}
        {GOAL_STREAK_MIN}+ in a row with a goal. Droughts (games in a row without a goal or a point) only count for regulars with {REGULAR_GP}+ games,
        and only once they reach {DROUGHT_MIN} games.
      </>
    ),
  },
  {
    id: "milestones",
    term: "Milestone watch",
    short: "Round-number milestones a player is close to, in his career or with the Oilers.",
    body: (
      <>
        Regular-season NHL totals: games every 100, goals every 50, assists and points every 100; for goalies, games every 100, wins every 50 and
        shutouts every 10. The home page shows up to {HOME_MILESTONES} when someone is within 10 games, 5 goals, 10 assists, 10 points, 5 wins or 2
        shutouts, and stays hidden otherwise. Player pages always show the next one.
      </>
    ),
  },
  {
    id: "edge",
    term: "NHL EDGE",
    short: "The NHL's puck- and player-tracking numbers.",
    body: <>Skating speed, speed bursts, distance skated, shot speed and time in each zone, measured by sensors in the puck and sweaters. Percentiles compare a player or team with the rest of the league. EDGE numbers come from the NHL directly; we don&apos;t compute them.</>,
  },
];

export default function StatsGuidePage() {
  const m = currentModel();
  const metrics = m.metrics as Metrics;
  const h = metrics.holdout;

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-6 sm:px-6 sm:py-10">
      <div>
        <h1 className="display-hero text-5xl sm:text-6xl">Stats guide</h1>
        <p className="mt-2 max-w-2xl text-fg-muted">What every number on the site means, how our expected-goals model works, where the data comes from, and what to take with a grain of salt.</p>
        <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-2 text-sm">
          {[
            ["#terms", "The stats"],
            ["#ratings", "Player ratings"],
            ["#clutch", "Clutch Score"],
            ["#shooting", "Shooting vs career"],
            ["#model", "Our xG model"],
            ["#sources", "Data and updates"],
            ["#caveats", "Caveats"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full bg-sunken px-3 py-1 font-semibold hover:text-accent-ink">
              {label}
            </a>
          ))}
        </nav>
      </div>

      <section aria-labelledby="terms">
        <h2 id="terms" className="display mb-4 text-3xl sm:text-4xl">
          The stats
        </h2>
        <dl className="space-y-3">
          {TERMS.map((t) => (
            <div key={t.id} id={t.id} className="card scroll-mt-24 p-4 sm:p-5">
              <dt>
                <span className="display text-xl">{t.term}</span>
                <span className="mt-0.5 block font-semibold">{t.short}</span>
              </dt>
              <dd className="mt-1.5 text-sm text-fg-muted">{t.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Ratings />

      <Clutch />

      <Shooting />

      <section aria-labelledby="model" className="space-y-4">
        <h2 id="model" className="display text-3xl sm:text-4xl">
          Our xG model
        </h2>
        <div className="card space-y-3 p-4 text-sm sm:p-5">
          <p>
            We built our own expected-goals model from the NHL&apos;s free play-by-play data rather than paying for one. It&apos;s a logistic regression: a standard statistical method that turns a shot&apos;s features into a probability of scoring. It looks at
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>distance and angle to the net (including shots from right on the doorstep or behind the goal line);</li>
            <li>shot type: wrist, snap, slap, backhand, tip, deflection, wraparound;</li>
            <li>whether it was a rebound or off the rush;</li>
            <li>strength: 5-on-5, power play, shorthanded;</li>
            <li>what happened just before (faceoff, another shot, a takeaway or giveaway, a hit) and how many seconds ago.</li>
          </ul>
          <p>
            Empty-net shots get their own simple model based on distance. In all, {m.features.length} features, trained on {metrics.trainingShots?.toLocaleString("en-CA") ?? "—"} unblocked shots ({metrics.trainingGoals?.toLocaleString("en-CA") ?? "—"} goals) from{" "}
            {(metrics.seasons ?? []).map(seasonLabel).join(" and ")}.
          </p>
        </div>

        {h && (
          <div className="card p-4 sm:p-5">
            <h3 className="display text-2xl">How well it works</h3>
            <p className="mt-1 text-sm text-fg-muted">Tested on {seasonLabel(h.testSeason)} shots the model never saw while learning.</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Shots tested", h.shots.toLocaleString("en-CA")],
                ["Goals vs xG", `${h.goals.toLocaleString("en-CA")} vs ${Math.round(h.expectedGoals).toLocaleString("en-CA")}`],
                ["AUC", h.auc.toFixed(3)],
                ["Better than guessing", `${(100 * (1 - h.logLoss / h.baselineLogLoss)).toFixed(1)}%`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-sunken px-3 py-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{k}</dt>
                  <dd className="numeral text-2xl">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-fg-muted">
              <strong className="text-fg">AUC</strong> is the chance the model rates a random goal as more dangerous than a random non-goal: 0.5 is a coin flip, and well-known public NHL models generally land in the mid-to-high 0.7s. &ldquo;Better than guessing&rdquo; compares its log loss (a measure of
              how wrong the probabilities are) with assigning every shot the league-average {(m.baseRate * 100).toFixed(1)}%. It runs slightly high overall ({(100 * (h.expectedGoals / h.goals - 1)).toFixed(0)}% more expected goals than real goals), so team and player xG are a touch generous across the board; comparisons between teams aren&apos;t affected.
            </p>
            <Calibration rows={h.calibration} />
          </div>
        )}
      </section>

      <section aria-labelledby="sources" className="space-y-3">
        <h2 id="sources" className="display text-3xl sm:text-4xl">
          Data and updates
        </h2>
        <div className="card space-y-2 p-4 text-sm sm:p-5">
          <p>
            Everything comes from the NHL&apos;s public data: the schedule, standings, rosters, box scores and play-by-play (with shot locations), shift charts (who was on the ice), the NHL stats site (power play, penalty kill, faceoffs) and NHL EDGE tracking. Our server stores every finished game&apos;s shots and calculates the advanced stats itself.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>The whole site is rebuilt three times a day: late evening after most games, overnight after West Coast games, and in the morning. During a game, the game page is a snapshot from the last update.</li>
            <li>Each update adds every finished game across the league and recalculates every stat and rank.</li>
            <li>Every section shows when its data was last updated.</li>
          </ul>
          <p>
            <Link href="/data" className="underline">
              Data status
            </Link>{" "}
            shows what&apos;s stored and when it last updated.
          </p>
        </div>
      </section>

      <section aria-labelledby="caveats" className="space-y-3">
        <h2 id="caveats" className="display text-3xl sm:text-4xl">
          Caveats
        </h2>
        <ul className="card list-disc space-y-2 p-4 pl-9 text-sm sm:p-5 sm:pl-10">
          <li>
            <strong>Early season:</strong> every number on the site is this season only. In the first few weeks that means small samples, so ranks and trends swing a lot from game to game. League ranks only appear once every team has played a game.
          </li>
          <li>
            <strong>Colours:</strong> green is good and red is bad, everywhere: a league rank in the top half or bottom half, a winning or losing streak, playoff odds above or below 50%, a rating above or below 5.0, and any plus/minus number above or below zero. On another team&apos;s page, green means good for that team.
          </li>
          <li>
            <strong>Hits, giveaways and takeaways</strong> depend on who&apos;s keeping score: some arenas record far more than others.
          </li>
          <li>
            <strong>Magic number:</strong> it appears from the midpoint of the season and is an estimate. It counts points against the first team outside the playoffs and doesn&apos;t model the NHL&apos;s full tiebreakers.
          </li>
          <li>
            <strong>Starting goalies</strong> aren&apos;t announced until game day, so the goalie matchup shows every goalie on both rosters.
          </li>
          <li>
            <strong>Shot locations</strong> are recorded by off-ice scorers and vary a little from rink to rink. Our model doesn&apos;t know about screens, passes before the shot or shooter skill.
          </li>
          <li>
            <strong>Ratings and lines</strong> need the NHL&apos;s shift charts, which are usually published within an hour of the final horn. If they&apos;re late, the game report shows shooters instead and fills in at the next update.
          </li>
          <li>
            <strong>Single games are noisy.</strong> A game report&apos;s xG tells you who had the better chances that night, not who&apos;s the better team.
          </li>
        </ul>
      </section>
    </div>
  );
}

const RATING_BANDS: [string, string, string][] = [
  ["9.0–10", "Exceptional", "top 1.5% of games"],
  ["8.0–8.9", "Excellent", "top 5%"],
  ["7.0–7.9", "Very good", "top 18%"],
  ["6.0–6.9", "Good", "above average"],
  ["5.0–5.9", "Average", "the middle"],
  ["below 5", "Rough game", "bottom 22%"],
];

/** How Game Score and the rating out of 10 work, with this season's cut-offs. */
function Ratings() {
  const w = GAME_SCORE;
  const weights: [string, string][] = [
    ["Goal", `+${w.goal}`],
    ["Primary assist", `+${w.a1}`],
    ["Secondary assist", `+${w.a2}`],
    ["Shot on goal", `+${w.sog}`],
    ["Blocked shot", `+${w.blk}`],
    ["Penalty drawn / taken", `+${w.penalty} / −${w.penalty}`],
    ["Faceoff won / lost", `+${w.faceoff} / −${w.faceoff}`],
    ["5-on-5 shot attempt for / against while on the ice", `+${w.corsi} / −${w.corsi}`],
    ["5-on-5 goal for / against while on the ice", `+${w.onIceGoal} / −${w.onIceGoal}`],
  ];
  const m = ratingModel;
  const cut = (i: number) => m.skater.cutoffs[i];
  return (
    <section aria-labelledby="ratings" className="scroll-mt-24 space-y-4">
      <h2 id="ratings" className="display text-3xl sm:text-4xl">
        Player ratings
      </h2>
      <div className="card space-y-3 p-4 text-sm sm:p-5">
        <p>
          Every player gets a <strong>rating out of 10</strong> for every game, like a soccer app. It starts from <strong>Game Score</strong>, a single-game
          measure created by hockey analyst Dom Luszczyszyn in 2016, which adds up what a player did that night:
        </p>
        <table className="w-full max-w-md text-sm">
          <caption className="sr-only">Game Score weights</caption>
          <tbody>
            {weights.map(([k, v]) => (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {k}
                </th>
                <td className="numeral py-1 text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Goalies are scored on goals saved above expected (from our model) times 0.75, the same weight as a goal: stop one more goal than an average goalie
          would, and that&apos;s worth what scoring one is.
        </p>
        <p>
          A raw Game Score is hard to read (is 1.4 good?), so we rank each one against every NHL game from the previous two seasons
          {m.skater.games ? ` (${m.skater.games.toLocaleString("en-CA")} skater games and ${m.goalie.games.toLocaleString("en-CA")} goalie games)` : ""}, and
          turn that into a rating. Goalies are only compared with goalies. The cut-offs are set once before the season, so a 7.5 means the same thing in
          October as in April.
        </p>
        <table className="w-full max-w-md text-sm">
          <caption className="sr-only">What each rating means</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-fg-muted">
              <th className="py-1 text-left font-semibold">Rating</th>
              <th className="py-1 text-left font-semibold">Meaning</th>
              <th className="py-1 text-left font-semibold">Share of games</th>
            </tr>
          </thead>
          <tbody>
            {RATING_BANDS.map(([r, label, share]) => (
              <tr key={r} className="border-t border-line">
                <td className="numeral py-1">{r}</td>
                <td className="py-1">{label}</td>
                <td className="py-1 text-fg-muted">{share}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {m.skater.cutoffs.length === RATING_ANCHORS.length && (
          <p className="text-fg-muted">
            For skaters this season, an average game (5.0–5.9) is a Game Score between {cut(1).toFixed(2)} and {cut(2).toFixed(2)}; a 7.0 takes{" "}
            {cut(3).toFixed(2)}; an 8.0 takes {cut(4).toFixed(2)}; a 9.0 takes {cut(5).toFixed(2)}.
          </p>
        )}
        <p className="text-fg-muted">
          Game Score rewards what shows up in the event data, so it favours scorers and shooters, and a quiet, solid defensive game can rate as average.
          Treat one rating as a summary of one night, and look at several games before drawing conclusions.
        </p>
      </div>
    </section>
  );
}

/** How Clutch Score works. */
/** How "Shooting vs career" works. */
function Shooting() {
  return (
    <section aria-labelledby="shooting" className="scroll-mt-24 space-y-4">
      <h2 id="shooting" className="display text-3xl sm:text-4xl">
        Shooting vs career
      </h2>
      <div className="shooting-card space-y-3 p-4 text-sm sm:p-5">
        <p>
          Shooting percentage (goals ÷ shots on goal) bounces around a lot over weeks or even a whole season, then drifts back toward a player&apos;s
          usual rate. Comparing this season with his <strong>NHL career before this season</strong> shows who&apos;s scoring more often than usual
          (running hot) and who&apos;s scoring less (due for some puck luck).
        </p>
        <p>
          We rank players by <strong>goals vs career rate</strong>: this season&apos;s goals minus what his career shooting % would give on the same
          number of shots. A player with 6 goals on 40 shots and a 10% career rate is <strong>+2.0</strong> (he&apos;d usually have 4). Counting goals
          rather than comparing percentages weighs how much a player shoots, so one goal on three shots doesn&apos;t top the list.
        </p>
        <p>
          Players need at least {MIN_CAREER_SHOTS} career NHL shots to have a career rate. On the{" "}
          <Link href="/shooting" className="underline">
            full list
          </Link>
          , pick a player to chart every NHL season: green dots are seasons above his career average, red below.
        </p>
        <p className="text-fg-muted">
          &ldquo;Due&rdquo; isn&apos;t a promise: shot quality matters too (a player taking worse shots will score less often), and real skill can change
          with age or role. Expected goals (ixG on the Players page) is the better guide to shot quality.
        </p>
      </div>
    </section>
  );
}

function Clutch() {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const weights: [string, string][] = [
    ["Overtime winner", String(CLUTCH.otWinner)],
    ["Tying goal", `${CLUTCH.tying} (${CLUTCH.tyingGoaliePulled} with their own goalie pulled)`],
    ["Go-ahead goal from a tie", String(CLUTCH.goAhead)],
    ["Insurance goal, from up one to up two", `${CLUTCH.insurance} (nothing for an empty-netter)`],
  ];
  return (
    <section aria-labelledby="clutch" className="scroll-mt-24 space-y-4">
      <h2 id="clutch" className="display text-3xl sm:text-4xl">
        Clutch Score
      </h2>
      <div className="clutch-card space-y-3 p-4 text-sm sm:p-5">
        <p>
          Nobody has found a reliable way to measure &ldquo;clutch&rdquo;, so treat this as a fun stat, not proof. Clutch Score adds up the big late goals:
          the <strong>last 10 minutes of the third period, or overtime</strong>, when the scoring team was behind by one, tied, or ahead by one just before
          the goal.
        </p>
        <table className="w-full max-w-md text-sm">
          <caption className="sr-only">Clutch Score points per goal</caption>
          <tbody>
            {weights.map(([k, v]) => (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {k}
                </th>
                <td className="numeral py-1 text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          The primary assist earns {pct(CLUTCH.a1Share)} of the goal&apos;s value and the secondary assist {pct(CLUTCH.a2Share)}, close to how Game Score
          weighs assists. Playoff goals count {CLUTCH.playoffs} times. Shootout goals don&apos;t count. It&apos;s worked out for every player in the league,
          so you can see where the Oilers stand on the{" "}
          <Link href="/clutch" className="underline">
            clutch leaders page
          </Link>
          .
        </p>
        <p className="text-fg-muted">
          Even top scorers only get a handful of these a season, so one big night can move a player a long way. It also rewards being on the ice late in
          close games, which depends on the coach as much as the player.
        </p>
      </div>
    </section>
  );
}

/** Predicted vs actual scoring rate in ten bins: dots on the diagonal mean the probabilities are honest. */
function Calibration({ rows }: { rows: Holdout["calibration"] }) {
  if (!rows?.length) return null;
  const max = Math.max(...rows.flatMap((r) => [r.predicted, r.actual])) * 1.05;
  const W = 300;
  const H = 220;
  const pad = { l: 40, r: 10, t: 10, b: 32 };
  const x = (v: number) => pad.l + (v / max) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const step = max > 0.4 ? 0.1 : 0.05;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-md" role="img" aria-label="Calibration: predicted versus actual goal rate in ten groups of shots. The dots sit close to the diagonal.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="0.5" />
            <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">
              {Math.round(t * 100)}%
            </text>
            <text x={x(t)} y={H - pad.b + 12} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} stroke="var(--text-muted)" strokeDasharray="4 3" strokeWidth="1" />
        {rows.map((r, i) => (
          <circle key={i} cx={x(r.predicted)} cy={y(r.actual)} r="4.5" fill="var(--chart-us)" stroke="var(--surface-raised)" strokeWidth="1.5">
            <title>{`Predicted ${(r.predicted * 100).toFixed(1)}%, actual ${(r.actual * 100).toFixed(1)}% (${r.shots.toLocaleString("en-CA")} shots)`}</title>
          </circle>
        ))}
        <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
          Predicted chance of a goal
        </text>
        <text transform={`translate(10 ${(pad.t + H - pad.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
          Actual goal rate
        </text>
      </svg>
      <figcaption className="mt-1 text-center text-xs text-fg-muted">Shots grouped into tenths by predicted chance. On the dashed line, predictions match reality.</figcaption>
    </figure>
  );
}
