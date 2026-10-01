import type { Metadata } from "next";
import Link from "next/link";
import { currentModel } from "@/lib/stats/xg";
import { seasonLabel } from "@/lib/nhl/endpoints";

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
            Everything comes from the NHL&apos;s public data: the schedule, standings, rosters, box scores and play-by-play (with shot locations), the NHL stats site (power play, penalty kill, faceoffs) and NHL EDGE tracking. Our server stores every finished game&apos;s shots and calculates the advanced stats itself.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Live game reports refresh every 30 seconds.</li>
            <li>Finished games across the league are added to the database within 15 minutes, and a full check runs every night.</li>
            <li>Standings, schedules and stats are cached for a few minutes to a few hours depending on how often they change; every module shows when it was last updated.</li>
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
            <strong>Early season:</strong> every number on the site is this season only. In the first few weeks that means small samples, so ranks and trends swing a lot from game to game.
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
            <strong>Single games are noisy.</strong> A game report&apos;s xG tells you who had the better chances that night, not who&apos;s the better team.
          </li>
        </ul>
      </section>
    </div>
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
