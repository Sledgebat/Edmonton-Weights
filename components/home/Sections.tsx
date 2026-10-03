import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Flame, Minus, Radio, Trophy, Tv, Zap } from "lucide-react";
import { ShareChart } from "@/components/charts/ShareChart";
import { DataError } from "@/components/data/Module";
import { RatingBadge } from "@/components/data/RatingBadge";
import { ResultBadge } from "@/components/data/ResultBadge";
import { HalfRink } from "@/components/rink/HalfRink";
import { RankPill } from "@/components/ui/RankPill";
import { LuckGauge } from "@/components/team/InDepth";
import { CardTabs } from "@/components/ui/CardTabs";
import { GOAL_STREAK_MIN, POINT_STREAK_MIN, REGULAR_GP } from "@/lib/streaks";
import { EdgeTiles, type EdgeTileData } from "@/components/home/EdgeTiles";
import { PregameToggle } from "@/components/home/PregameToggle";
import { Countdown } from "@/components/ui/Countdown";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { SMALL_SAMPLE_GAMES, type GoalieCard, type HeatMap, type HomeData, type TapeRow, type Tile } from "@/lib/home";
import type { Shooter } from "@/lib/shooting";
import { formatOdds } from "@/lib/stats/odds";
import { RANKS_PENDING_NOTE, oddsTone, ratingTone, signedTone, streakTone, trendTone } from "@/lib/tone";
import { txt } from "@/lib/nhl";
import { seasonLabel } from "@/lib/nhl/endpoints";
import { edmontonDate } from "@/lib/nhl/resources";
import { formatGameDate, formatGameTime, ordinal, streakLabel, teamView, type Outcome } from "@/lib/oilers";
import type { TeamGame } from "@/lib/stats/team";

// ------------------------------------------------------------------ shared bits

export function SectionHeading({ id, title, note }: { id: string; title: string; note?: string | null }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="display text-3xl sm:text-4xl">
        {title}
      </h2>
      {note && <p className="text-xs text-fg-muted">{note}</p>}
    </div>
  );
}

function TrendTag({ trend, recent }: { trend: Tile["trend"]; recent: string | null }) {
  if (!trend || !recent) return null;
  const Icon = trend === "better" ? ArrowUpRight : trend === "worse" ? ArrowDownRight : Minus;
  const word = trend === "better" ? "Better" : trend === "worse" ? "Worse" : "Steady";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${trendTone(trend) || "text-fg-muted"}`}
    >
      <Icon size={14} aria-hidden />
      {word} lately · last 10: {recent}
    </span>
  );
}

const outcomeOf = (g: TeamGame): Outcome => (g.gf > g.ga ? "W" : g.lastPeriodType === "SO" ? "SOL" : g.lastPeriodType === "OT" ? "OTL" : "L");
const shortDate = (d: string) => formatGameDate(d + "T18:00:00Z", { month: "short", day: "numeric" });

// ------------------------------------------------------------------ 1. snapshot

export function Snapshot({ d }: { d: HomeData }) {
  const e = d.edm;
  const p = d.picture;
  if (!d.standings.ok) return <DataError what="the standings" error={d.standings.error} />;
  if (!e || !p) return <p className="text-fg-muted">The Oilers aren&apos;t in the current standings.</p>;
  const items: [string, string, string?][] = [
    ["Record", `${e.wins}-${e.losses}-${e.otLosses}`],
    ["Points", String(e.points)],
    ["Division", `${ordinal(e.divisionSequence)} ${e.divisionName}`],
    ["Streak", streakLabel(e) || "—", streakTone(e.streakCode)],
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([k, v, tone]) => (
          <div key={k} className="card px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{k}</dt>
            <dd className={`numeral mt-0.5 ${k === "Streak" ? "text-4xl leading-none sm:text-5xl" : "text-2xl leading-tight sm:text-3xl"} ${tone ?? ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <PictureCard d={d} />
    </div>
  );
}

/** A big number with its label underneath. */
function Figure({ value, label, tone = "" }: { value: string; label: string; tone?: string }) {
  return (
    <div className="text-center">
      <p className={`numeral text-5xl leading-none ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{label}</p>
    </div>
  );
}

/** Playoff odds beside the points pace (or, from mid-season, the magic or tragic number). */
function PictureCard({ d }: { d: HomeData }) {
  const p = d.picture!;
  const o = d.odds;
  const plural = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;
  let figure: { value: string; label: string; tone?: string };
  let sentence: React.ReactNode;
  if (p.showNumbers && p.inPlayoffSpot) {
    figure = { value: p.clinched ? "✓" : String(p.magicNumber), label: "Magic number", tone: "text-accent-ink" };
    sentence = p.clinched
      ? "Playoff spot clinched (estimate)."
      : `Any combination of ${p.magicNumber} Oilers points gained or ${p.rival?.team} points lost clinches a playoff spot.`;
  } else if (p.showNumbers) {
    figure = { value: p.eliminated ? "✕" : String(p.tragicNumber), label: "Tragic number", tone: "text-loss" };
    sentence = `${plural(Math.abs(p.cushion))} behind ${p.rival?.team} for the last playoff spot.`;
  } else {
    figure = { value: String(p.pace), label: "Points pace" };
    sentence = (
      <>
        {p.inPlayoffSpot ? `Holding a playoff spot (${p.spot})` : "Outside the playoff spots"}
        {p.rival ? `, ${plural(Math.abs(p.cushion))} ${p.cushion >= 0 ? "ahead of" : "behind"} ${p.rival.team}.` : "."}{" "}
        <span className="text-fg-muted">The magic number appears at the season&apos;s midpoint.</span>
      </>
    );
  }
  return (
    <div className="card px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        {o && <Figure value={formatOdds(o.odds)} label="Playoff odds" tone={oddsTone(o.odds)} />}
        <Figure {...figure} />
      </div>
      <p className="mt-3 text-sm">{sentence}</p>
      {o ? (
        <p className="mt-1 text-xs text-fg-muted">
          Odds and magic number are estimates. Odds come from 10,000 simulations of the rest of the season
          {p.gamesPlayed < SMALL_SAMPLE_GAMES ? "; this early they move a lot from game to game" : ""}.{" "}
          <Link href="/standings?view=race" className="underline">
            Playoff race
          </Link>
        </p>
      ) : (
        <p className="mt-1 text-xs text-fg-muted">Estimate: full NHL tiebreakers aren&apos;t modelled.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 2. next game

function TeamKey({ name, side }: { name: string; side: "us" | "them" }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden className={`inline-block h-3 w-3 rounded-sm ${side === "us" ? "bg-us" : "bg-them"}`} />
      {name}
    </span>
  );
}

function TaleOfTheTape({ rows, oppAbbrev }: { rows: TapeRow[]; oppAbbrev: string }) {
  const len = (rank: number | null, of: number) => (rank === null || !of ? 0 : ((of + 1 - rank) / of) * 100);
  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        <span>EDM · value (rank)</span>
        <span />
        <span className="text-right">{oppAbbrev} · value (rank)</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key} className="text-sm">
            <p className="mb-1 text-center text-xs font-semibold text-fg-muted">{r.label}</p>
            <div className="grid grid-cols-2 items-center gap-1">
              <div className="flex items-center justify-end gap-2" title={`Edmonton: ${r.us.value}${r.us.rank ? `, ${ordinal(r.us.rank)} of ${r.of}` : ""}`}>
                <span className="numeral whitespace-nowrap text-xs">
                  {r.us.value} <span className="text-fg-muted">{r.us.rank ? `(${ordinal(r.us.rank)})` : ""}</span>
                </span>
                <span className="relative h-3 w-full max-w-[9rem] sm:max-w-[14rem]">
                  <span className="absolute inset-y-0 right-0 rounded-l bg-us" style={{ width: `${len(r.us.rank, r.of)}%` }} />
                </span>
              </div>
              <div className="flex items-center gap-2" title={`${oppAbbrev}: ${r.them.value}${r.them.rank ? `, ${ordinal(r.them.rank)} of ${r.of}` : ""}`}>
                <span className="relative h-3 w-full max-w-[9rem] sm:max-w-[14rem]">
                  <span className="absolute inset-y-0 left-0 rounded-r bg-them" style={{ width: `${len(r.them.rank, r.of)}%` }} />
                </span>
                <span className="numeral whitespace-nowrap text-xs">
                  {r.them.value} <span className="text-fg-muted">{r.them.rank ? `(${ordinal(r.them.rank)})` : ""}</span>
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-fg-muted">
        {rows.some((r) => r.us.rank !== null || r.them.rank !== null)
          ? "Longer bar = better league rank, so every row reads the same way (for goals against, fewer is better)."
          : RANKS_PENDING_NOTE}
      </p>
    </div>
  );
}

export function Heat({ title, map, max, side }: { title: string; map: HeatMap; max: number; side: "us" | "them" }) {
  const pct = Math.round(map.vsLeague * 100);
  const vs = pct === 0 ? "league average overall" : `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than average overall`;
  return (
    <figure>
      <HalfRink bins={map.bins} max={max} color={`var(--chart-${side})`} label={`${title}: where they get more chances than an average team. ${vs}.`} />
      <figcaption className="mt-1 text-center text-xs">
        <span className="block font-semibold">{title}</span>
        <span className="text-fg-muted">{vs}</span>
      </figcaption>
    </figure>
  );
}

export function GoalieList({ goalies, team }: { goalies: GoalieCard[]; team: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{team}</p>
      {goalies.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">Roster not available right now.</p>
      ) : (
        <table className="mt-1 w-full text-sm">
          <caption className="sr-only">{team} goalies this season</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-fg-muted">
              <th className="py-1 text-left font-semibold">Goalie</th>
              <th className="py-1 text-right font-semibold">GP</th>
              <th className="py-1 text-right font-semibold" title="Save percentage">
                SV%
              </th>
              <th className="py-1 text-right font-semibold" title="Goals saved above expected">
                GSAx
              </th>
            </tr>
          </thead>
          <tbody>
            {goalies.map((g) => (
              <tr key={g.id} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-semibold">
                  <Link href={g.href} className="hover:underline">
                    {g.name}
                  </Link>
                </th>
                <td className="numeral text-right">{g.gp}</td>
                <td className="numeral text-right">{g.svPct === null ? "—" : g.svPct.toFixed(3).replace(/^0/, "")}</td>
                <td className={`numeral text-right ${signedTone(g.gsax, 1)}`}>
                  {g.gsax === null ? "—" : `${g.gsax > 0 ? "+" : ""}${g.gsax.toFixed(1)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function NextGame({ d }: { d: HomeData }) {
  if (!d.schedule.ok) return <DataError what="the schedule" error={d.schedule.error} />;
  if (!d.next || !d.opponent) return <p className="text-fg-muted">No upcoming games on the schedule.</p>;
  const g = d.next;
  const v = teamView(g);
  const today = edmontonDate(new Date(g.startTimeUTC)) === edmontonDate();
  const tv = (g.tvBroadcasts ?? []).filter((b) => b.countryCode === "CA" || b.market === "N").map((b) => b.network);
  const oppShort = txt(v.opp.commonName, v.opp.abbrev);
  const heatMax = d.heat ? Math.max(d.heat.usFor.max, d.heat.themFor.max, d.heat.usAgainst.max, d.heat.themAgainst.max) : 1;

  return (
    <div className="space-y-4">
      <PregameToggle
        footer={<div className="sleeve-stripes-thin" aria-hidden />}
        strip={<StakesStrip d={d} />}
        bar={
          <div className="flex items-center gap-4">
            <TeamLogo abbrev={v.opp.abbrev} logo={v.opp.logo} darkLogo={v.opp.darkLogo} size={52} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-header-accent">{v.live ? "Live now" : today ? "Tonight" : "Next game"}</p>
              <p className="display text-3xl leading-none sm:text-4xl">
                {v.isHome ? "vs" : "@"} {d.opponent.name}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm opacity-85">
                {formatGameDate(g.startTimeUTC, { weekday: "long", month: "long", day: "numeric" })} · {formatGameTime(g.startTimeUTC)} MT
                {tv.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Tv size={14} aria-hidden /> {tv.join(", ")}
                  </span>
                )}
              </p>
            </div>
          </div>
        }
        actions={
          <>
            {!(v.live || today) && (
              <span className="text-xl">
                <Countdown to={g.startTimeUTC} />
              </span>
            )}
            <Link href={`/game/${g.id}`} className="btn btn-primary">
              <Radio size={16} aria-hidden /> Game page
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <TeamKey name="Oilers" side="us" />
          <TeamKey name={oppShort} side="them" />
          {d.seasonNote && <span className="text-xs text-fg-muted">{d.seasonNote}</span>}
          <Link href={`/team/${d.opponent.abbrev}`} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
            Scout the {oppShort} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4 sm:p-5" aria-labelledby="tape">
            <h3 id="tape" className="display text-2xl">
              Tale of the tape
            </h3>
            <p className="mb-3 text-xs text-fg-muted">
              {seasonLabel(d.season)} · shares are 5-on-5 · pace = 5-on-5 shot attempts per 60 by both teams, 1st = fastest · speed bursts = times any player
              tops 20 mph, per game (NHL EDGE, ranked per game by us)
            </p>
            {d.tape && <TaleOfTheTape rows={d.tape} oppAbbrev={v.opp.abbrev} />}
          </section>

          <div className="space-y-4">
            <section className="card p-4 sm:p-5" aria-labelledby="keys">
              <h3 id="keys" className="display text-2xl">
                Keys to the game
              </h3>
              {d.keys.length ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {d.keys.map((k) => (
                    <li key={k} className="flex gap-2">
                      <ArrowRight size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
                      {k}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-fg-muted">These two teams are close on every measure.</p>
              )}
            </section>

            <section className="card p-4 sm:p-5" aria-labelledby="form">
              <h3 id="form" className="display text-2xl">
                Recent form
              </h3>
              <p className="text-xs text-fg-muted">5-on-5 expected-goals share in each of the last 10 games · above 50% = outplayed the opponent</p>
              <ShareChart
                ariaLabel={`5-on-5 expected-goals share, last 10 games: Oilers and ${oppShort}`}
                series={[
                  {
                    key: "us",
                    name: "Oilers",
                    points: d.form.us.map((x) => ({
                      label: shortDate(x.date),
                      detail: `${x.isHome ? "vs" : "@"} ${x.opponent}`,
                      value: share(x.xgf5, x.xga5),
                    })),
                  },
                  {
                    key: "them",
                    name: oppShort,
                    points: d.form.them.map((x) => ({
                      label: shortDate(x.date),
                      detail: `${x.isHome ? "vs" : "@"} ${x.opponent}`,
                      value: share(x.xgf5, x.xga5),
                    })),
                  },
                ]}
              />
            </section>
          </div>
        </div>

        {d.heat && (
          <section className="card p-4 sm:p-5" aria-labelledby="heat">
            <h3 id="heat" className="display text-2xl">
              Where the chances come from
            </h3>
            <p className="text-xs text-fg-muted">
              Shaded areas are where each team creates or allows more dangerous chances than an average NHL team, {seasonLabel(d.season)}. Darker = further
              above average; blank = average or below. Net at the top.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Heat title="Oilers create" map={d.heat.usFor} max={heatMax} side="us" />
              <Heat title={`${oppShort} create`} map={d.heat.themFor} max={heatMax} side="them" />
              <Heat title="Oilers allow" map={d.heat.usAgainst} max={heatMax} side="us" />
              <Heat title={`${oppShort} allow`} map={d.heat.themAgainst} max={heatMax} side="them" />
            </div>
          </section>
        )}

        {d.dash.series && d.dash.series.meetings.length > 0 && (
          <section className="card p-4 sm:p-5" aria-labelledby="series">
            <h3 id="series" className="display text-2xl">
              Season series
            </h3>
            <p className="text-xs text-fg-muted">{d.dash.series.line} · expected goals from our model, all situations</p>
            <ul className="mt-2 space-y-1.5">
              {d.dash.series.meetings.map((m) => (
                <li key={m.gameId} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <Link href={`/game/${m.gameId}`} className="inline-flex items-center gap-2 hover:underline">
                    <ResultBadge outcome={m.outcome} />
                    {shortDate(m.date)} {m.isHome ? "vs" : "@"} {oppShort}
                  </Link>
                  <span className="numeral text-fg-muted">
                    {m.gf}–{m.ga}
                    {m.decidedIn !== "REG" ? ` ${m.decidedIn}` : ""}
                    {m.xgf !== null && m.xga !== null ? ` · xG ${m.xgf.toFixed(1)}–${m.xga.toFixed(1)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card p-4 sm:p-5" aria-labelledby="goalies">
          <h3 id="goalies" className="display text-2xl">
            Goalie matchup
          </h3>
          <p className="mb-3 text-xs text-fg-muted">
            {seasonLabel(d.season)} numbers for every goalie on both rosters. Starters aren&apos;t announced until game day.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <GoalieList goalies={d.goalies?.us ?? []} team="Oilers" />
            <GoalieList goalies={d.goalies?.them ?? []} team={oppShort} />
          </div>
        </section>
      </PregameToggle>
    </div>
  );
}

const share = (f: number, a: number) => (f + a > 0 ? (f / (f + a)) * 100 : 50);

/** Under the Next game bar: what tonight means for the playoff odds, and the season series. */
function StakesStrip({ d }: { d: HomeData }) {
  const s = d.dash.stakes;
  const series = d.dash.series;
  if (!s && !series) return null;
  const item = (label: string, odds: number) => (
    <span className="whitespace-nowrap">
      {label} → <span className={`numeral font-semibold ${oddsTone(odds)}`}>{formatOdds(odds)}</span>
    </span>
  );
  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-sm">
      {s && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted" title={`Playoff odds now ${formatOdds(s.now)}`}>
            Playoff odds after tonight
          </span>
          {item("Win", s.win)}
          <span aria-hidden className="text-fg-muted">·</span>
          {item("OT loss", s.otLoss)}
          <span aria-hidden className="text-fg-muted">·</span>
          {item("Loss", s.loss)}
        </p>
      )}
      {series && <p className="text-fg-muted">{series.line}</p>}
    </div>
  );
}

/** Comeback and stolen-game badges, only when they apply. */
export function GameBadges({ badges }: { badges: { kind: string; text: string }[] }) {
  if (!badges.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <li key={b.text} className="rounded-full border border-accent px-2.5 py-0.5 text-xs font-semibold text-accent-ink">
          {b.text}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ last game

export function LastGame({ d }: { d: HomeData }) {
  if (!d.last) return <p className="text-fg-muted">No games played yet this season.</p>;
  const v = teamView(d.last);
  const r = d.lastReport;
  const side = r ? (r.home.abbrev === "EDM" ? "home" : "away") : null;
  const us = r && side ? r[side] : null;
  const them = r && side ? r[side === "home" ? "away" : "home"] : null;
  const stats: [string, string, string][] =
    us && them
      ? [
          ["Expected goals", us.xg.toFixed(1), them.xg.toFixed(1)],
          ["High-danger chances", String(us.hd), String(them.hd)],
          ["Shots on goal", String(us.sog), String(them.sog)],
          ["5-on-5 shot share", `${share(us.attempts5, them.attempts5).toFixed(0)}%`, `${share(them.attempts5, us.attempts5).toFixed(0)}%`],
        ]
      : [];
  return (
    <div className="card grid gap-5 p-4 sm:p-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
      <div className="flex items-center gap-4">
        <TeamLogo abbrev={v.opp.abbrev} logo={v.opp.logo} darkLogo={v.opp.darkLogo} size={48} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
            {formatGameDate(d.last.startTimeUTC)} · {v.prefix} {txt(v.opp.commonName, v.opp.abbrev)}
          </p>
          <p className="mt-1 flex items-center gap-2">
            <span className="numeral text-4xl leading-none">
              {v.us.score}–{v.opp.score}
            </span>
            {v.outcome && <ResultBadge outcome={v.outcome} />}
            {v.decidedIn !== "REG" && <span className="text-xs font-semibold text-fg-muted">{v.decidedIn}</span>}
          </p>
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        <GameBadges badges={d.dash.lastBadges} />
        {r?.summary && <p className="text-sm sm:text-base">{r.summary}</p>}
        {stats.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
            {stats.map(([k, a, b]) => (
              <div key={k} className="rounded bg-sunken px-2 py-1.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{k}</dt>
                <dd className="numeral">
                  {a}–{b}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {d.lastRatings.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Top Oilers ratings</p>
            <ol className="mt-1 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {d.lastRatings.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <RatingBadge rating={p.rating} />
                  <Link href={`/player/${p.id}`} className="font-semibold hover:underline">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
        {!r && <p className="text-sm text-fg-muted">The game breakdown isn&apos;t available right now.</p>}
      </div>
      <Link href={`/game/${d.last.id}`} className="btn btn-primary justify-self-start">
        Full game report <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}

// ------------------------------------------------------------------ 3. stat tiles

export function TileCard({ t, extra }: { t: Tile; extra?: React.ReactNode }) {
  return (
    <div className="card flex flex-col p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t.label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="numeral text-3xl leading-none">{t.value}</p>
        <RankPill rank={t.rank} of={t.of} />
      </div>
      {t.detail && <p className="numeral mt-1 text-xs text-fg-muted">{t.detail}</p>}
      {extra}
      <div className="mt-1 min-h-4">
        <TrendTag trend={t.trend} recent={t.recent} />
      </div>
      <p className="mt-2 text-xs leading-snug text-fg-muted">{t.explain}</p>
    </div>
  );
}

/** The small luck gauge on the home page's PDO tile, linking to the full meter. */
function TileLuck({ luck, href }: { luck: NonNullable<HomeData["dash"]["luck"]>; href: string }) {
  return (
    <Link href={href} className="mt-2 flex items-center gap-2 rounded-md bg-sunken px-2 py-1 text-xs hover:underline" title="Luck meter: points vs what their chances deserved">
      <LuckGauge diff={luck.diff} clip={luck.clip} size={64} />
      <span>
        <span className="font-semibold">Luck</span>
        <span className="block text-fg-muted">
          {luck.actual} pts · deserved {luck.deserved.toFixed(1)}
        </span>
      </span>
    </Link>
  );
}

export function StatTiles({ d, luck, luckHref = "/team/EDM#luck" }: { d: Pick<HomeData, "advancedTiles" | "basicTiles">; luck?: HomeData["dash"]["luck"]; luckHref?: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-fg-muted">Advanced (5-on-5 unless noted)</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {d.advancedTiles.map((t) => (
            <TileCard key={t.key} t={t} extra={t.key === "pdo" && luck ? <TileLuck luck={luck} href={luckHref} /> : undefined} />
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-fg-muted">Basic</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {d.basicTiles.map((t) => (
            <TileCard key={t.key} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 4. recent performance

/** The best single-game ratings of the last five games, each linked to its game report. */
function TopRecent({ rows }: { rows: HomeData["topRecent"] }) {
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="top-recent">
      <h3 id="top-recent" className="display text-2xl">
        Top game scores, last 5 games
      </h3>
      <p className="text-xs text-fg-muted">
        Best single-game ratings out of 10 · Game Score in brackets ·{" "}
        <Link href="/stats-guide#ratings" className="underline">
          How ratings work
        </Link>
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Ratings appear once games have shift data from the NHL.</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={`${r.gameId}-${r.id}`} className="flex items-center gap-3 text-sm">
              <RatingBadge rating={r.rating} />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <Link href={`/player/${r.id}`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>{" "}
                  <span className="numeral text-xs text-fg-muted">({r.gameScore.toFixed(2)})</span>
                </p>
                <p className="truncate text-xs text-fg-muted">{r.line}</p>
              </div>
              <Link href={`/game/${r.gameId}`} className="shrink-0 whitespace-nowrap text-xs font-semibold text-accent-ink hover:underline">
                {shortDate(r.date)} {r.isHome ? "vs" : "@"} {r.opponent} <ArrowRight size={12} className="inline" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function RecentPerformance({
  d,
  team = "Oilers",
  side = "us",
  hasGamePage = () => true,
}: {
  d: Pick<HomeData, "recent" | "trend" | "season"> & Partial<Pick<HomeData, "topRecent">>;
  team?: string;
  side?: "us" | "them";
  /** Game reports exist only for Oilers games; other cards aren't links. */
  hasGamePage?: (g: TeamGame) => boolean;
}) {
  return (
    <div className="space-y-4">
      {d.recent.length === 0 && <p className="text-sm text-fg-muted">No games played yet this season.</p>}
      <ol className="flex snap-x gap-2 overflow-x-auto pb-2" aria-label="Last 10 games, oldest first">
        {d.recent.map((g) => {
          const o = outcomeOf(g);
          const cf = share(g.cf5, g.ca5);
          const body = (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                {shortDate(g.date)} · {g.isHome ? "vs" : "@"} {g.opponent}
              </p>
              <p className="mt-1 flex items-center gap-2">
                <span className="numeral text-2xl">
                  {g.gf}–{g.ga}
                </span>
                <ResultBadge outcome={o} />
              </p>
              <p className="mt-1 text-xs">
                <span className="text-fg-muted">xG</span>{" "}
                <span className="numeral">
                  {g.xgf.toFixed(1)}–{g.xga.toFixed(1)}
                </span>
              </p>
              <p className="text-xs">
                <span className="text-fg-muted">Shot share</span> <span className="numeral">{cf.toFixed(0)}%</span>
              </p>
            </>
          );
          return (
            <li key={g.gameId} className="snap-start">
              {hasGamePage(g) ? (
                <Link href={`/game/${g.gameId}`} className="card block w-36 shrink-0 p-3 transition hover:border-line-strong">
                  {body}
                </Link>
              ) : (
                <div className="card block w-36 shrink-0 p-3">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      <div className={d.topRecent ? "grid gap-4 lg:grid-cols-2" : ""}>
        <section className="card p-4 sm:p-5" aria-labelledby="season-trend">
          <h3 id="season-trend" className="display text-2xl">
            Season trend
          </h3>
          <p className="text-xs text-fg-muted">5-on-5 expected-goals share, rolling 5 games, {seasonLabel(d.season)} · above 50% = controlling play</p>
          {d.trend.length >= 3 ? (
            <ShareChart
              ariaLabel={`${team} 5-on-5 expected-goals share, rolling five games, ${seasonLabel(d.season)}`}
              series={[{ key: side, name: team, points: d.trend.map((t) => ({ label: shortDate(t.date), detail: "5-game average", value: t.value })) }]}
            />
          ) : (
            <p className="mt-3 text-sm text-fg-muted">The trend line appears after three games.</p>
          )}
        </section>
        {d.topRecent && <TopRecent rows={d.topRecent} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 5. leaders

/** A top-five list: rank, linked name, the main number, and a muted detail. */
function LeaderBox({
  id,
  title,
  note,
  rows,
  empty,
}: {
  id: string;
  title: string;
  note: React.ReactNode;
  rows: { id: number; name: string; value: React.ReactNode; detail: string; tone?: string }[];
  empty: string;
}) {
  return (
    <section className="card p-4" aria-labelledby={id}>
      <h3 id={id} className="display text-2xl">
        {title}
      </h3>
      <p className="mb-2 text-xs text-fg-muted">{note}</p>
      <ol className="space-y-1.5 text-sm">
        {rows.map((p, i) => (
          <li key={p.id} className="flex items-baseline justify-between gap-2">
            <Link href={`/player/${p.id}`} className="truncate hover:underline">
              <span className="numeral mr-2 text-accent-ink">{i + 1}</span>
              {p.name}
            </Link>
            <span className="numeral whitespace-nowrap">
              <span className={p.tone}>{p.value}</span> <span className="text-xs font-normal text-fg-muted">{p.detail}</span>
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-fg-muted">{empty}</li>}
      </ol>
    </section>
  );
}

export function Leaders({ d }: { d: HomeData }) {
  const L = d.leaders;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <section className="card p-4" aria-labelledby="lead-pts">
        <h3 id="lead-pts" className="display text-2xl">
          Points
        </h3>
        <p className="mb-2 text-xs text-fg-muted">{seasonLabel(d.season)}</p>
        <ol className="space-y-1.5 text-sm">
          {L.points.map((p, i) => (
            <li key={p.id} className="flex items-baseline justify-between gap-2">
              <Link href={`/player/${p.id}`} className="truncate hover:underline">
                <span className="numeral mr-2 text-accent-ink">{i + 1}</span>
                {p.name}
              </Link>
              <span className="numeral whitespace-nowrap">
                {p.points}{" "}
                <span className="text-xs font-normal text-fg-muted">
                  ({p.goals}G {p.assists}A)
                </span>
              </span>
            </li>
          ))}
          {L.points.length === 0 && <li className="text-fg-muted">No games yet.</li>}
        </ol>
      </section>

      <LeaderBox
        id="lead-goals"
        title="Goals"
        note={`${seasonLabel(d.season)} · goals · shots on goal`}
        rows={L.goals.map((p) => ({ id: p.id, name: p.name, value: p.goals, detail: `(${p.shots} SOG)` }))}
        empty="No goals yet."
      />

      <LeaderBox
        id="lead-a"
        title="Assists"
        note={`${seasonLabel(d.season)} · assists · points`}
        rows={L.assists.map((p) => ({ id: p.id, name: p.name, value: p.assists, detail: `(${p.points} P)` }))}
        empty="No assists yet."
      />

      <LeaderBox
        id="lead-gs"
        title="Game Score"
        note={
          <>
            {seasonLabel(d.season)} · average rating out of 10, skaters with {L.rating.minGames}+ games ·{" "}
            <Link href="/stats-guide#ratings" className="underline">
              What&apos;s this?
            </Link>
          </>
        }
        rows={L.rating.rows.map((p) => ({
          id: p.id,
          name: p.name,
          value: p.avgRating.toFixed(1),
          tone: ratingTone(p.avgRating),
          detail: `(${p.gp} GP)`,
        }))}
        empty="Appears once games have shift data."
      />

      <section className="card p-4" aria-labelledby="lead-xg">
        <h3 id="lead-xg" className="display text-2xl">
          Expected goals
        </h3>
        <p className="mb-2 text-xs text-fg-muted">{seasonLabel(d.season)} · individual xG · goals · high-danger chances</p>
        <ol className="space-y-1.5 text-sm">
          {L.ixg.map((p, i) => (
            <li key={p.id} className="flex items-baseline justify-between gap-2">
              <Link href={`/player/${p.id}`} className="truncate hover:underline">
                <span className="numeral mr-2 text-accent-ink">{i + 1}</span>
                {p.name}
              </Link>
              <span className="numeral whitespace-nowrap">
                {p.ixg.toFixed(1)}{" "}
                <span className="text-xs font-normal text-fg-muted">
                  ({p.goals}G · {p.hd} HD)
                </span>
              </span>
            </li>
          ))}
          {L.ixg.length === 0 && <li className="text-fg-muted">No shots stored yet.</li>}
        </ol>
      </section>

      <section className="card p-4" aria-labelledby="lead-g">
        <h3 id="lead-g" className="display text-2xl">
          Goalies
        </h3>
        <p className="mb-2 text-xs text-fg-muted">{seasonLabel(d.season)} · save % · goals saved above expected</p>
        <ul className="space-y-1.5 text-sm">
          {L.goalies.map((g) => (
            <li key={g.id} className="flex items-baseline justify-between gap-2">
              <Link href={`/player/${g.id}`} className="truncate hover:underline">
                {g.name} <span className="text-xs text-fg-muted">{g.gp} GP</span>
              </Link>
              <span className="numeral whitespace-nowrap">
                {g.svPct.toFixed(3).replace(/^0/, "")}{" "}
                <span className="text-xs font-normal text-fg-muted">{g.gsax === null ? "" : `${g.gsax >= 0 ? "+" : ""}${g.gsax.toFixed(1)}`}</span>
              </span>
            </li>
          ))}
          {L.goalies.length === 0 && <li className="text-fg-muted">No games yet.</li>}
        </ul>
      </section>
    </div>
  );
}

/** Clutch Score: the Oilers' top three, set apart in orange, linking to the league list. */
export function ClutchBox({ d }: { d: HomeData }) {
  const c = d.clutch;
  return (
    <section className="clutch-card mt-4 p-4" aria-labelledby="lead-clutch">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="lead-clutch" className="display inline-flex items-center gap-1.5 text-2xl">
          <Zap size={20} aria-hidden className="text-accent-ink" />
          Clutch Score
        </h3>
        <p className="text-xs text-fg-muted">
          {seasonLabel(d.season)} · late tying and go-ahead goals, OT winners ·{" "}
          <Link href="/stats-guide#clutch" className="underline">
            What&apos;s this?
          </Link>
        </p>
      </div>
      {c.rows.length > 0 ? (
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {c.rows.map((p, i) => (
            <li key={p.id} className="rounded-lg bg-raised/70 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/player/${p.id}`} className="truncate font-semibold hover:underline">
                  <span className="numeral mr-2 text-accent-ink">{i + 1}</span>
                  {p.name}
                </Link>
                <span className="numeral text-xl">{p.score.toFixed(2)}</span>
              </div>
              <p className="mt-0.5 text-xs text-fg-muted">
                {p.summary} · {ordinal(p.rank)} in the NHL
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-fg-muted">
          {c.ready ? "No Oilers clutch points yet this season. The first late equalizer or OT winner will show up here." : "Appears after the next update."}
        </p>
      )}
      {c.leaguePlayers > 0 && (
        <Link href="/clutch" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
          See the league&apos;s clutch leaders ({c.leaguePlayers} players) <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </section>
  );
}

/** One shooter in the hot/cold lists: goals above or below his career rate, and the two percentages. */
function ShooterLine({ s }: { s: Shooter }) {
  const v = s.vsCareer ?? 0;
  return (
    <li className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <Link href={`/shooting?player=${s.id}`} className="truncate font-semibold hover:underline">
          {s.name}
        </Link>
        <p className="text-xs text-fg-muted">
          {s.pct === null ? "—" : `${s.pct.toFixed(1)}%`} this season · {s.careerPct?.toFixed(1)}% career
        </p>
      </div>
      <span className={`numeral whitespace-nowrap text-xl ${signedTone(v, 1)}`} title="Goals above or below what his career shooting % would give on the same shots">
        {v > 0 ? "+" : ""}
        {v.toFixed(1)}
      </span>
    </li>
  );
}

/** Shooting vs career: the three running hottest and coldest, set apart in Oilers blue. */
function ShootingPanel({ d }: { d: HomeData }) {
  const { hot, cold, note } = d.shooting;
  return (
    <div>
      <p className="text-xs text-fg-muted">
        {seasonLabel(d.season)} shooting % against each player&apos;s NHL career · goals above or below his career rate ·{" "}
        <Link href="/stats-guide#shooting" className="underline">
          What&apos;s this?
        </Link>
      </p>
      {hot.length + cold.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Shows up once the Oilers have taken some shots this season.</p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-raised/70 px-3 py-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Running hot</p>
            <ol className="space-y-2 text-sm">
              {hot.map((s) => (
                <ShooterLine key={s.id} s={s} />
              ))}
              {hot.length === 0 && <li className="text-fg-muted">Nobody above his career rate yet.</li>}
            </ol>
          </div>
          <div className="rounded-lg bg-raised/70 px-3 py-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Due</p>
            <ol className="space-y-2 text-sm">
              {cold.map((s) => (
                <ShooterLine key={s.id} s={s} />
              ))}
              {cold.length === 0 && <li className="text-fg-muted">Nobody below his career rate yet.</li>}
            </ol>
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-xs text-fg-muted">{note}</p>}
      <Link href="/shooting" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold hover:underline">
        Every Oilers shooter, with career charts <ArrowRight size={14} aria-hidden />
      </Link>
    </div>
  );
}

const games = (n: number) => `${n} ${n === 1 ? "game" : "games"}`;

/** Point and goal streaks, and the longest droughts among regulars. */
function StreaksPanel({ d }: { d: HomeData }) {
  const s = d.dash.streaks;
  const row = (id: number, name: string, value: string, detail: string, tone = "") => (
    <li key={`${id}-${value}`} className="flex items-baseline justify-between gap-3">
      <Link href={`/player/${id}`} className="truncate font-semibold hover:underline">
        {name}
      </Link>
      <span className="whitespace-nowrap text-right">
        <span className={`numeral ${tone}`}>{value}</span> <span className="text-xs text-fg-muted">{detail}</span>
      </span>
    </li>
  );
  const hot = [
    ...s.pointStreaks.map((p) => row(p.id, p.name, games(p.runs.points), `with a point (${p.runs.pointsGoals} G, ${p.runs.pointsAssists} A)`, "text-win")),
    ...s.goalStreaks.map((p) => row(p.id, p.name, games(p.runs.goals), `with a goal (${p.runs.goalsScored} G)`, "text-win")),
  ];
  const cold = [
    ...s.goalless.map((p) => row(p.id, p.name, games(p.runs.goalless), "without a goal", "text-loss")),
    ...s.pointless.map((p) => row(p.id, p.name, games(p.runs.pointless), "without a point", "text-loss")),
  ];
  return (
    <div>
      <p className="text-xs text-fg-muted">
        Active runs, regular season: point streaks of {POINT_STREAK_MIN}+ games and goal streaks of {GOAL_STREAK_MIN}+; droughts among players with{" "}
        {REGULAR_GP}+ games.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-raised/70 px-3 py-2">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">On a roll</p>
          <ol className="space-y-2 text-sm">{hot.length ? hot : <li className="text-fg-muted">No active point or goal streaks right now.</li>}</ol>
        </div>
        <div className="rounded-lg bg-raised/70 px-3 py-2">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Droughts</p>
          <ol className="space-y-2 text-sm">{cold.length ? cold : <li className="text-fg-muted">No long droughts among the regulars.</li>}</ol>
        </div>
      </div>
    </div>
  );
}

/** Hot and cold: streaks (default) and shooting vs career, set apart in Oilers blue. */
export function HotAndCold({ d }: { d: HomeData }) {
  return (
    <section className="shooting-card mt-4 p-4" aria-labelledby="hot-cold">
      <h3 id="hot-cold" className="display mb-2 inline-flex items-center gap-1.5 text-2xl">
        <Flame size={20} aria-hidden />
        Hot and cold
      </h3>
      <CardTabs
        label="Hot and cold"
        tabs={[
          { key: "streaks", label: "Streaks", panel: <StreaksPanel d={d} /> },
          { key: "shooting", label: "Shooting vs career", panel: <ShootingPanel d={d} /> },
        ]}
      />
    </section>
  );
}

/** Milestone watch: only when someone is close. */
export function MilestoneStrip({ d }: { d: HomeData }) {
  if (!d.dash.milestones.length) return null;
  return (
    <div className="card mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 px-4 py-2 text-sm">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        <Trophy size={14} aria-hidden /> Milestone watch
      </span>
      {d.dash.milestones.map((m) => (
        <span key={m.id}>
          <Link href={`/player/${m.id}`} className="font-semibold hover:underline">
            {m.name}
          </Link>{" "}
          <span className="text-fg-muted">{m.text}</span>
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ 6. NHL EDGE

export function EdgeSection({ d }: { d: HomeData }) {
  if (!d.edge.ok) return <DataError what="NHL EDGE tracking data" error={d.edge.error} />;
  const e = d.edge.data;
  const avg = (a: unknown, unit: string, digits = 1) => {
    const v = typeof a === "number" ? a : ((a as { imperial?: number; value?: number } | undefined)?.imperial ?? (a as { value?: number } | undefined)?.value);
    return typeof v === "number" ? `League avg ${v.toFixed(digits)}${unit}` : null;
  };
  const z = e.zoneTimeDetails;
  const roster = d.rosterEdge;
  const overlayName = (o: unknown) => {
    const p = (o as { overlay?: { player?: { firstName?: { default: string }; lastName?: { default: string } } } } | undefined)?.overlay?.player;
    return p ? `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""}`.trim() : null;
  };
  const listOf = (title: string, unit: string, digits: number, pick: (r: (typeof roster)[number]) => number | null): EdgeTileData["list"] => ({
    title,
    unit,
    digits,
    rows: roster.flatMap((r) => {
      const value = pick(r);
      return value === null ? [] : [{ id: r.id, name: r.name, pos: r.pos, value }];
    }),
  });
  const b20 = d.bursts.over20.get("EDM");
  const b22 = d.bursts.over22.get("EDM");
  const perGame = (v?: number | null) => (typeof v === "number" ? v.toFixed(1) : "—");
  const fastest = roster.length ? [...roster].filter((r) => r.speedMax !== null).sort((a, b) => b.speedMax! - a.speedMax!)[0] : null;
  const hardest = roster.length ? [...roster].filter((r) => r.topShot !== null).sort((a, b) => b.topShot! - a.topShot!)[0] : null;

  const tiles: EdgeTileData[] = [
    {
      key: "speed",
      label: "Top skating speed",
      value: e.skatingSpeed?.speedMax?.imperial ? `${e.skatingSpeed.speedMax.imperial.toFixed(1)} mph` : "—",
      rank: e.skatingSpeed?.speedMax?.rank ?? null,
      of: 32,
      note: [fastest?.name ?? overlayName(e.skatingSpeed?.speedMax), avg(e.skatingSpeed?.speedMax?.leagueAvg, " mph")].filter(Boolean).join(" · "),
      list: listOf("Top skating speed", "mph", 1, (r) => r.speedMax),
    },
    {
      key: "b22",
      label: "Speed bursts over 22 mph, per game",
      value: perGame(b22?.value),
      rank: b22?.rank ?? null,
      of: b22?.of ?? 0,
    },
    {
      key: "b20",
      label: "Speed bursts over 20 mph, per game",
      value: perGame(b20?.value),
      rank: b20?.rank ?? null,
      of: b20?.of ?? 0,
      list: listOf("Speed bursts over 20 mph, this season", "", 0, (r) => r.bursts20),
    },
    {
      key: "distance",
      label: "Distance skated",
      value: e.distanceSkated?.total?.imperial ? `${e.distanceSkated.total.imperial.toFixed(1)} mi` : "—",
      rank: e.distanceSkated?.total?.rank ?? null,
      of: 32,
      note: avg(e.distanceSkated?.total?.leagueAvg, " mi"),
    },
    {
      key: "shot",
      label: "Hardest shot",
      value: e.shotSpeed?.topShotSpeed?.imperial ? `${e.shotSpeed.topShotSpeed.imperial.toFixed(1)} mph` : "—",
      rank: e.shotSpeed?.topShotSpeed?.rank ?? null,
      of: 32,
      note: [hardest?.name ?? overlayName(e.shotSpeed?.topShotSpeed), avg(e.shotSpeed?.topShotSpeed?.leagueAvg, " mph")].filter(Boolean).join(" · "),
      list: listOf("Hardest shot", "mph", 1, (r) => r.topShot),
    },
    { key: "s90", label: "Shots over 90 mph", value: String(e.shotSpeed?.shotAttemptsOver90?.value ?? "—"), rank: e.shotSpeed?.shotAttemptsOver90?.rank ?? null, of: 32 },
    {
      key: "oz",
      label: "Offensive-zone time",
      value: z?.offensiveZonePctg !== undefined ? `${(z.offensiveZonePctg * 100).toFixed(1)}%` : "—",
      rank: (z as { offensiveZoneRank?: number } | undefined)?.offensiveZoneRank ?? null,
      of: 32,
      note: z?.offensiveZoneLeagueAvg !== undefined ? `League avg ${(z.offensiveZoneLeagueAvg * 100).toFixed(1)}%` : null,
    },
    {
      key: "dz",
      label: "Defensive-zone time",
      value: z?.defensiveZonePctg !== undefined ? `${(z.defensiveZonePctg * 100).toFixed(1)}%` : "—",
      rank: (z as { defensiveZoneRank?: number } | undefined)?.defensiveZoneRank ?? null,
      of: 32,
      note: "Lower is better; rank 1 = least time defending",
    },
  ];
  if (!d.ranksNote) return <EdgeTiles tiles={tiles} />;
  return (
    <>
      <p className="-mt-2 mb-3 text-sm text-fg-muted">{d.ranksNote}</p>
      <EdgeTiles tiles={tiles.map((t) => ({ ...t, rank: null }))} />
    </>
  );
}
