/**
 * Sections of the Season In-Depth page (/team/[abbrev]). Every number follows the site's colour
 * rules (lib/tone.ts); the luck meter is the one deliberate exception and stays neutral.
 */
import Link from "next/link";
import { RankPill } from "@/components/ui/RankPill";
import { LuckChart } from "@/components/team/LuckChart";
import { SMALL_SAMPLE_GAMES } from "@/lib/home";
import { formatGameDate, ordinal } from "@/lib/oilers";
import { recordText, pointsPct, type GameScript, type Record3 } from "@/lib/stats/situations";
import type { Split } from "@/lib/stats/scoring";
import { RANKS_PENDING_NOTE, signedTone } from "@/lib/tone";
import { SITUATIONS, type SituationKey, type TeamPageData } from "@/lib/team";

const shortDate = (d: string) => (d ? formatGameDate(d + "T18:00:00Z", { month: "short", day: "numeric" }) : "");
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
const sampleWait = (gp: number) =>
  `Appears after ${SMALL_SAMPLE_GAMES} games (${gp === 0 ? "none" : gp} played so far): before that, a couple of bounces would decide it.`;

function Card({ title, id, children, note }: { title: string; id?: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-4 sm:p-5" aria-labelledby={id ? `${id}-title` : undefined}>
      <h3 id={id ? `${id}-title` : undefined} className="display text-2xl">
        {title}
      </h3>
      {note && <p className="mt-0.5 text-xs text-fg-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ records

/** RW, home, road, overtime and shootout records in one compact card. */
export function MoreRecords({ d }: { d: TeamPageData }) {
  const r = d.row;
  const s = d.situations?.summary;
  if (!r) return null;
  const items: [string, string, string?][] = [
    ["Regulation wins", String(r.regulationWins), "The first tiebreaker"],
    ["Home", `${r.homeWins}-${r.homeLosses}-${r.homeOtLosses}`, d.venueXgf.home === null ? undefined : `${d.venueXgf.home.toFixed(1)}% xGF at 5 on 5`],
    ["Road", `${r.roadWins}-${r.roadLosses}-${r.roadOtLosses}`, d.venueXgf.road === null ? undefined : `${d.venueXgf.road.toFixed(1)}% xGF at 5 on 5`],
    ["Overtime", s ? `${s.overtime.w}-${s.overtime.otl}` : "—", "Wins and losses in games decided in OT"],
    ["Shootout", s ? `${s.shootout.w}-${s.shootout.otl}` : "—", "Wins and losses in shootouts"],
  ];
  return (
    <dl className="card mt-3 grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-5">
      {items.map(([k, v, note]) => (
        <div key={k}>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{k}</dt>
          <dd className="numeral text-xl leading-tight">{v}</dd>
          {note && <dd className="text-[11px] leading-snug text-fg-muted">{note}</dd>}
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ personality

export function PersonalityCard({ d }: { d: TeamPageData }) {
  const p = d.personality;
  return (
    <Card title="Team personality" id="personality" note="How they play, from where they rank in the league">
      {!p ? (
        <p className="text-sm text-fg-muted">{d.gp < SMALL_SAMPLE_GAMES ? sampleWait(d.gp) : RANKS_PENDING_NOTE}</p>
      ) : (
        <div>
          <p className="display text-3xl text-accent-ink">{p.primary.type.label}</p>
          {p.secondary && <p className="text-sm font-semibold text-fg-muted">with a streak of {p.secondary.type.label.toLowerCase()}</p>}
          <p className="mt-2 text-sm">{p.primary.type.blurb}</p>
          <ul className="mt-3 space-y-1.5">
            {p.primary.reasons.map((r) => (
              <li key={r.trait} className="flex items-center justify-between gap-3 text-sm">
                <span>{r.label}</span>
                {/* Luck is neither good nor bad, so it stays plain. */}
                {r.trait === "luck" ? (
                  <span className="numeral text-xs text-fg-muted">
                    {r.rank === 1 ? "luckiest" : `${ordinal(r.rank)} luckiest`} of {r.of}
                  </span>
                ) : (
                  <RankPill rank={r.rank} of={r.of} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ luck meter

/** Semicircle gauge, needle at actual minus deserved points (clipped). Neutral colours on purpose. */
export function LuckGauge({ diff, clip, size = 200 }: { diff: number; clip: number; size?: number }) {
  const v = Math.max(-clip, Math.min(clip, diff));
  const angle = Math.PI - ((v + clip) / (2 * clip)) * Math.PI;
  const cx = 100;
  const cy = 100;
  const nx = cx + 70 * Math.cos(angle);
  const ny = cy - 70 * Math.sin(angle);
  const tick = (t: number) => {
    const a = Math.PI - ((t + clip) / (2 * clip)) * Math.PI;
    return { x1: cx + 74 * Math.cos(a), y1: cy - 74 * Math.sin(a), x2: cx + 88 * Math.cos(a), y2: cy - 88 * Math.sin(a) };
  };
  return (
    <svg viewBox="0 0 200 118" width={size} className="max-w-full" role="img" aria-label={`Luck meter: ${signed1(diff)} points against what their chances deserved`}>
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--border)" strokeWidth="14" strokeLinecap="round" />
      {[-clip, -clip / 2, 0, clip / 2, clip].map((t) => (
        <line key={t} {...tick(t)} stroke="var(--border-strong)" strokeWidth={t === 0 ? 2.5 : 1.5} />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" strokeWidth="4" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="7" fill="var(--text)" />
      <text x="18" y="116" fontSize="11" fill="var(--text-muted)" fontWeight="600">
        Unlucky
      </text>
      <text x="182" y="116" fontSize="11" fill="var(--text-muted)" fontWeight="600" textAnchor="end">
        Lucky
      </text>
    </svg>
  );
}

export function LuckMeter({ d, full = true }: { d: TeamPageData; full?: boolean }) {
  const l = d.luck;
  if (!l) return null;
  const t = l.team;
  const points = t.games.map((g, i) => {
    const upTo = t.games.slice(0, i + 1);
    return {
      label: shortDate(g.date),
      opponent: g.opponent,
      actual: upTo.reduce((s, x) => s + x.actual, 0),
      deserved: upTo.reduce((s, x) => s + x.deserved, 0),
    };
  });
  return (
    <Card
      title="Luck meter"
      id="luck"
      note={
        <>
          Points banked vs points their chances deserved, game by game.{" "}
          <Link href="/stats-guide#luck" className="underline">
            How it works
          </Link>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <LuckGauge diff={t.diff} clip={l.clip} />
        <div className="min-w-0 flex-1 basis-56">
          <p className="numeral text-2xl leading-tight">
            {t.actual} {t.actual === 1 ? "point" : "points"} · deserved {t.deserved.toFixed(1)}
          </p>
          {l.rank !== null && (
            <p className="text-xs text-fg-muted">
              {l.rank === 1 ? "Luckiest" : `${ordinal(l.rank)} luckiest`} of {l.of} teams
            </p>
          )}
          <p className="mt-2 text-sm">{l.verdict ?? <span className="text-fg-muted">{sampleWait(d.gp).replace("Appears", "The verdict appears")}</span>}</p>
        </div>
      </div>
      {full && points.length >= 2 && (
        <div className="mt-4">
          <LuckChart points={points} team={d.shortName} ariaLabel={`${d.shortName} points over the season against deserved points: ${t.actual} vs ${t.deserved.toFixed(1)}`} />
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ situations

function RecordRow({ label, r, rank, of }: { label: string; r: Record3; rank: number | null; of: number }) {
  const pp = pointsPct(r);
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-1.5 pr-2 text-left font-normal">
        {label}
      </th>
      <td className="numeral px-2 text-right">{recordText(r)}</td>
      <td className="numeral px-2 text-right text-fg-muted">{pp === null ? "—" : pp.toFixed(3).replace(/^0/, "")}</td>
      <td className="py-1.5 pl-2 text-right">{rank !== null ? <RankPill rank={rank} of={of} /> : null}</td>
    </tr>
  );
}

export function SituationRecords({ d }: { d: TeamPageData }) {
  const s = d.situations;
  if (!s) return <p className="text-sm text-fg-muted">No games with goal data stored for this team yet.</p>;
  const groups: { title: string; keys: SituationKey[] }[] = [
    { title: "First goal", keys: ["scoringFirst", "allowingFirst"] },
    { title: "After one period", keys: ["leadingAfter1", "tiedAfter1", "trailingAfter1"] },
    { title: "After two periods", keys: ["leadingAfter2", "tiedAfter2", "trailingAfter2"] },
    { title: "Close games and venue", keys: ["oneGoal", "home", "road"] },
  ];
  return (
    <Card
      title="Records by situation"
      id="records"
      note={`Wins-losses-OT/SO losses · point % · league rank by point %${d.ranksReady ? "" : ` · ${RANKS_PENDING_NOTE}`}`}
    >
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {groups.map((g) => (
          <table key={g.title} className="w-full text-sm">
            <caption className="text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">{g.title}</caption>
            <tbody>
              {g.keys.map((k) => (
                <RecordRow key={k} label={SITUATIONS[k]} r={s.summary[k] as Record3} rank={s.ranks[k].rank} of={s.ranks[k].of} />
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <p className="mt-3 text-xs text-fg-muted">One-goal games: decided by one goal (shootouts included), or by two with an empty-net goal.</p>
    </Card>
  );
}

function GameLine({ g, d }: { g: GameScript; d: TeamPageData }) {
  const href = d.abbrev === "EDM" || g.opponent === "EDM" ? `/game/${g.gameId}` : `https://www.nhl.com/gamecenter/${g.gameId}`;
  const suffix = g.decidedIn === "REG" ? "" : ` (${g.decidedIn})`;
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <Link href={href} className="hover:underline">
        {shortDate(g.date)} {g.isHome ? "vs" : "at"} {g.opponent}
      </Link>
      <span className="numeral whitespace-nowrap text-fg-muted">
        {g.gf}–{g.ga}
        {suffix} · {g.outcome === "W" ? `down ${-g.maxDeficit}` : `up ${g.maxLead}`}
      </span>
    </li>
  );
}

export function Comebacks({ d }: { d: TeamPageData }) {
  const s = d.situations?.summary;
  if (!s) return null;
  const stat = (label: string, value: string | number, tone = "") => (
    <div className="rounded bg-sunken px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{label}</p>
      <p className={`numeral text-2xl leading-tight ${tone}`}>{value}</p>
    </div>
  );
  return (
    <Card title="Comebacks and blown leads" id="comebacks">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stat("Comeback wins", s.comebackWins.length, s.comebackWins.length ? "text-win" : "")}
        {stat("Biggest comeback", s.biggestComeback ? `${s.biggestComeback} goals` : "—")}
        {stat("Won trailing after 2", s.wonTrailingAfter2, s.wonTrailingAfter2 ? "text-win" : "")}
        {stat("Blown 2-goal leads", s.blownLeads.length, s.blownLeads.length ? "text-loss" : "")}
        {stat("Lost leading after 2", s.lostLeadingAfter2, s.lostLeadingAfter2 ? "text-loss" : "")}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Wins after trailing by 2+</p>
          {s.comebackWins.length ? (
            <ul className="mt-1 space-y-1">
              {[...s.comebackWins].reverse().map((g) => (
                <GameLine key={g.gameId} g={g} d={d} />
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-fg-muted">None yet.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Losses after leading by 2+ (incl. OT and shootouts)</p>
          {s.blownLeads.length ? (
            <ul className="mt-1 space-y-1">
              {[...s.blownLeads].reverse().map((g) => (
                <GameLine key={g.gameId} g={g} d={d} />
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-fg-muted">None yet.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function GoalsByPeriod({ d }: { d: TeamPageData }) {
  const s = d.situations?.summary;
  if (!s) return null;
  const labels = ["1st", "2nd", "3rd", "OT"];
  return (
    <Card title="Goals by period" id="periods" note="Shootout goals not included">
      <table className="w-full max-w-md text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-fg-muted">
          <tr>
            <th scope="col" className="py-1 text-left font-semibold">
              Period
            </th>
            <th scope="col" className="px-2 text-right font-semibold">
              For
            </th>
            <th scope="col" className="px-2 text-right font-semibold">
              Against
            </th>
            <th scope="col" className="pl-2 text-right font-semibold">
              Diff
            </th>
          </tr>
        </thead>
        <tbody>
          {labels.map((p, i) => {
            const diff = s.goalsFor[i] - s.goalsAgainst[i];
            return (
              <tr key={p} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {p}
                </th>
                <td className="numeral px-2 text-right">{s.goalsFor[i]}</td>
                <td className="numeral px-2 text-right">{s.goalsAgainst[i]}</td>
                <td className={`numeral pl-2 text-right ${signedTone(diff)}`}>{diff > 0 ? `+${diff}` : diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// ------------------------------------------------------------------ special teams

const specialValue = (key: string, v: number | null) => {
  if (v === null) return "—";
  if (key === "ppTime") return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
  return key === "penaltyDiff" ? signed1(v) : v.toFixed(2);
};

export function SpecialTeams({ d }: { d: TeamPageData }) {
  const groups: { title: string; keys: string[] }[] = [
    { title: "Special teams (per game)", keys: ["ppOpp", "ppTime", "ppGoalsFor", "shGoalsAgainst", "timesSH", "ppGoalsAgainst", "shGoalsFor"] },
    { title: "Discipline and the physical game (per game)", keys: ["penaltyDiff", "hits", "blocks", "giveaways", "takeaways"] },
  ];
  const pp = d.basicTiles.find((t) => t.key === "powerPlayPct");
  const pk = d.basicTiles.find((t) => t.key === "penaltyKillPct");
  return (
    <Card
      title="Special teams and discipline"
      id="special"
      note="League rank in brackets. Hits, blocks, giveaways and takeaways are counted by arena scorekeepers and ranked by volume, not as good or bad."
    >
      <div className="mb-3 flex flex-wrap gap-x-8 gap-y-2">
        {[pp, pk].map((t) =>
          t ? (
            <div key={t.key} className="flex items-baseline gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t.label}</span>
              <span className="numeral text-2xl">{t.value}</span>
              <RankPill rank={t.rank} of={t.of} />
            </div>
          ) : null,
        )}
      </div>
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {groups.map((g) => (
          <table key={g.title} className="w-full text-sm">
            <caption className="text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">{g.title}</caption>
            <tbody>
              {g.keys.map((k) => {
                const r = d.special.find((x) => x.key === k);
                if (!r) return null;
                return (
                  <tr key={k} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                      {r.label.replace(/,? per game$/, "")}
                    </th>
                    <td className={`numeral px-2 text-right ${k === "penaltyDiff" ? signedTone(r.value, 1) : ""}`}>{specialValue(k, r.value)}</td>
                    <td className="py-1.5 pl-2 text-right">
                      {r.rank === null ? null : r.higherIsBetter === null ? (
                        <span className="numeral text-xs text-fg-muted">{ordinal(r.rank)} most</span>
                      ) : (
                        <RankPill rank={r.rank} of={r.of} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ how they score

function SplitBars({ title, splits, team }: { title: string; splits: Split[]; team: string }) {
  const max = Math.max(0.01, ...splits.flatMap((s) => [s.xgShare, s.leagueXgShare, s.goalShare]));
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</p>
      <ul className="mt-2 space-y-2.5">
        {splits.map((s) => (
          <li key={s.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span>{s.label}</span>
              <span className="numeral whitespace-nowrap text-xs text-fg-muted">
                {s.goals} G · {s.xg.toFixed(1)} xG
              </span>
            </div>
            <div className="mt-1 space-y-0.5" aria-hidden>
              <span className="block h-2 rounded-r bg-us" style={{ width: `${(s.xgShare / max) * 100}%` }} />
              <span className="block h-2 rounded-r bg-line-strong" style={{ width: `${(s.leagueXgShare / max) * 100}%` }} />
            </div>
            <p className="sr-only">
              {team}: {pct1(s.xgShare)} of expected goals and {pct1(s.goalShare)} of goals; league average {pct1(s.leagueXgShare)} of expected goals.
            </p>
            <p className="numeral mt-0.5 text-[11px] text-fg-muted" aria-hidden>
              {pct1(s.xgShare)} of their xG ({pct1(s.goalShare)} of goals) · league {pct1(s.leagueXgShare)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HowTheyScore({ d }: { d: TeamPageData }) {
  const p = d.scoring;
  if (!p) return <p className="text-sm text-fg-muted">No shots stored for this team yet this season.</p>;
  return (
    <Card
      title="How they score"
      id="how-they-score"
      note={`Share of their expected goals (and goals) from each kind of chance, against the league average. ${p.goals} goals from ${p.xg.toFixed(1)} expected, empty-net shots left out.`}
    >
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2 w-5 rounded-r bg-us" /> {d.shortName}
        </span>
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <span aria-hidden className="inline-block h-2 w-5 rounded-r bg-line-strong" /> League average
        </span>
      </div>
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
        <SplitBars title="Where the chance came from" splits={p.origin} team={d.shortName} />
        <SplitBars title="Shot type" splits={p.shotType} team={d.shortName} />
        <SplitBars title="Strength" splits={p.strength} team={d.shortName} />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        {([["Rebound xG per 60", p.reboundXg60]] as const).map(([label, r]) => (
          <div key={label} className="flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</span>
            <span className="numeral">{r.value.toFixed(2)}</span>
            {d.ranksReady && <RankPill rank={r.rank} of={r.of} />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-fg-muted">
        Rebound: within 3 seconds of a teammate&apos;s shot on goal. Rush: within 4 seconds of play outside the offensive zone. The NHL&apos;s
        play-by-play rarely records the play just before a team carries the puck in, so only the clearest rushes show up (about 1 shot in 100).
      </p>
    </Card>
  );
}

// ------------------------------------------------------------------ goaltending

export function GoalieStarts({ d }: { d: TeamPageData }) {
  if (!d.goalieStarts.length) return <p className="text-sm text-fg-muted">No goalie starts stored yet this season.</p>;
  const th = "px-2 py-2 text-right font-semibold";
  return (
    <Card
      title="Starts"
      id="starts"
      note={
        <>
          A start is the game where he faced the first shot.{" "}
          <Link href="/stats-guide#goalie-starts" className="underline">
            Quality starts, really bad starts and stolen games explained
          </Link>
        </>
      }
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-fg-muted">
            <tr>
              <th scope="col" className="sticky left-0 bg-raised px-1 py-2 text-left font-semibold">
                Goalie
              </th>
              <th scope="col" className={th}>
                <abbr title="Starts">GS</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Quality starts">QS</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Share of starts that were quality starts">QS%</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Really bad starts: save % below .850">RBS</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Wins where he saved 2+ goals above expected, and at least the winning margin">Stolen</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Save % on high-danger shots">HDSV%</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {d.goalieStarts.map((g) => (
              <tr key={g.goalieId} className="border-t border-line">
                <th scope="row" className="sticky left-0 bg-raised px-1 py-1.5 text-left font-semibold">
                  <Link href={g.href} className="hover:underline">
                    {g.name}
                  </Link>
                </th>
                <td className="numeral px-2 text-right">{g.starts}</td>
                <td className="numeral px-2 text-right">{g.qualityStarts}</td>
                <td className="numeral px-2 text-right">{g.starts ? `${((g.qualityStarts / g.starts) * 100).toFixed(1)}` : "—"}</td>
                <td className="numeral px-2 text-right">{g.badStarts}</td>
                <td className="numeral px-2 text-right">{g.stolen}</td>
                <td className="numeral px-2 text-right">{g.hdShots ? (1 - g.hdGoals / g.hdShots).toFixed(3).replace(/^0/, "") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function StolenGames({ d }: { d: TeamPageData }) {
  return (
    <Card title="Stolen games" id="stolen" note="Wins where the goalie saved 2 or more goals above expected, and at least the winning margin: without him, they probably lose">
      {d.stolen.length === 0 ? (
        <p className="text-sm text-fg-muted">None yet this season.</p>
      ) : (
        <ul className="space-y-1.5">
          {d.stolen.map((s) => (
            <li key={`${s.gameId}-${s.goalie}`} className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                <Link href={s.href} className="hover:underline">
                  {shortDate(s.date)} {s.isHome ? "vs" : "at"} {s.opponent}
                </Link>
                <span className="ml-2 font-semibold">{s.goalie}</span>
              </span>
              <span className="numeral whitespace-nowrap text-win">{signed1(s.gsax)} GSAx</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
