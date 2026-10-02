import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataError, Module } from "@/components/data/Module";
import { XgTimeline, type XgGoal, type XgRow } from "@/components/game/XgTimeline";
import { RatingBadge } from "@/components/data/RatingBadge";
import { SortableTable, type Column, type TableRow } from "@/components/players/SortableTable";
import { FullRink, type RinkShot } from "@/components/rink/FullRink";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { load } from "@/lib/load";
import { nhl, txt } from "@/lib/nhl";
import { TEAM } from "@/lib/nhl/endpoints";
import type { GameLanding } from "@/lib/nhl/schemas";
import { formatGameDate, formatGameTime, savePct } from "@/lib/oilers";
import { builtGameIds, builtPlayerIds, playerHref } from "@/lib/site";
import { analyzeGame, type GameReport, type Side, type TeamTotals } from "@/lib/stats/game";
import { gameRatings, gameUnits, regularUnits, type RatedGame, type Unit } from "@/lib/stats/onice";

export const dynamicParams = false;

/** One report page per Oilers game this season. */
export async function generateStaticParams() {
  const ids = await builtGameIds();
  return (ids.length ? ids : [2026020001]).map((id) => ({ id: String(id) }));
}

export async function generateMetadata({ params }: PageProps<"/game/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Game report ${id}` };
}

const STATE: Record<string, string> = { FUT: "Upcoming", PRE: "Pre-game", LIVE: "Live", CRIT: "Live", FINAL: "Final", OFF: "Final" };
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const pct = (a: number, b: number) => (a + b ? (100 * a) / (a + b) : 50);

function TeamKey({ name, side }: { name: string; side: "us" | "them" }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden className={`inline-block h-3 w-3 rounded-sm ${side === "us" ? "bg-us" : "bg-them"}`} />
      {name}
    </span>
  );
}

/** Game report: how the game went, in expected goals, chances and shot locations. */
export default async function GamePage({ params }: PageProps<"/game/[id]">) {
  const { id } = await params;
  if (!/^\d{10}$/.test(id)) notFound();
  const gameId = Number(id);
  // Games that haven't started come straight from the schedule: nothing to analyse yet.
  const schedule = await load(nhl.schedule);
  const fromSchedule = schedule.ok ? schedule.data.games.find((x) => x.id === gameId) : undefined;
  const upcoming = fromSchedule && ["FUT", "PRE"].includes(fromSchedule.gameState);
  const landing = upcoming
    ? ({ ok: true, data: fromSchedule as unknown as GameLanding, meta: schedule.ok ? schedule.meta : undefined } as const)
    : await load(() => nhl.gameLanding(gameId));
  const built = await builtPlayerIds();

  if (!landing.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="display-hero text-5xl">Game {id}</h1>
        <div className="mt-6">
          <DataError what="this game" error={landing.error} />
        </div>
      </div>
    );
  }

  const g = landing.data;
  const started = !["FUT", "PRE"].includes(g.gameState);
  const live = g.gameState === "LIVE" || g.gameState === "CRIT";
  const pbp = started ? await load(() => nhl.playByPlay(gameId)) : null;
  const report = pbp?.ok ? analyzeGame(pbp.data, g) : null;
  // Ratings and lines come from the shift charts, stored once the game is final.
  const ratings = report ? gameRatings(gameId) : [];
  const roster = new Map((pbp?.ok ? pbp.data.rosterSpots : []).map((r) => [r.playerId, r]));
  const names = (id: number, short = false) => {
    const r = roster.get(id);
    return r ? (short ? txt(r.lastName) : `${txt(r.firstName)} ${txt(r.lastName)}`) : `#${id}`;
  };
  const href = (pid: number) => playerHref(pid, built);
  // "Us" is the Oilers when they play; otherwise the home team.
  const usSide: Side = g.awayTeam.abbrev === TEAM ? "away" : "home";
  const themSide: Side = usSide === "home" ? "away" : "home";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      {live && (
        <p className="card p-4 text-sm">
          This game was in progress at the last site update, so the numbers below are a snapshot. The site updates a few times a day.{" "}
          <a href={`https://www.nhl.com/gamecenter/${gameId}`} className="font-semibold text-accent-ink underline">
            Follow it live on NHL.com
          </a>
        </p>
      )}
      <Header g={g} report={report} live={live} />

      {!started && (
        <Module title="Report coming at puck drop">
          <p className="text-fg-muted">
            Expected goals, the shot map and high-danger chances fill in as soon as the game starts, and show up in the first site update after puck drop. The site updates a few times a day.
          </p>
          {(g.homeTeam.abbrev === TEAM || g.awayTeam.abbrev === TEAM) && (
            <Link href="/#next" className="btn btn-secondary mt-4">
              Pre-game breakdown on the home page
            </Link>
          )}
        </Module>
      )}

      {started && !report && <DataError what="the play-by-play for this game" error={pbp && !pbp.ok ? pbp.error : undefined} />}

      {report && (
        <>
          <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
            <Comparison us={report[usSide]} them={report[themSide]} />
            <Module title="Expected goals through the game" meta={pbp?.ok ? pbp.meta : undefined}>
              <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1">
                <TeamKey name={report[usSide].name} side="us" />
                <TeamKey name={report[themSide].name} side="them" />
                <span className="text-xs text-fg-muted">Circles mark goals</span>
              </div>
              <Timeline report={report} usSide={usSide} />
            </Module>
          </div>

          <Module title="Shot map">
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
              <TeamKey name={`${report[themSide].name} shooting ←`} side="them" />
              <TeamKey name={`→ ${report[usSide].name} shooting`} side="us" />
              <span className="text-xs text-fg-muted">Bigger dot = better chance · filled = goal · blocked shots not shown</span>
            </div>
            <FullRink shots={rinkShots(report, usSide)} label={`Shot map: ${report[usSide].abbrev} attacking right, ${report[themSide].abbrev} attacking left`} />
          </Module>

          <div className="grid gap-6 lg:grid-cols-2">
            <ByStrength report={report} usSide={usSide} themSide={themSide} />
            <Goalies report={report} href={href} />
          </div>

          {ratings.length ? (
            <PlayerRatings ratings={ratings} report={report} names={names} href={href} />
          ) : (
            <TopShooters report={report} href={href} pending={!live && g.gameType !== 1} />
          )}

          {ratings.length > 0 && <LinesTonight gameId={gameId} report={report} usSide={usSide} themSide={themSide} names={names} />}

          <div className="grid gap-6 lg:grid-cols-2">
            <ThreeStars g={g} href={href} />
            <Scoring g={g} />
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/schedule" className="btn btn-secondary">
          All games
        </Link>
        <Link href="/stats-guide" className="btn btn-secondary">
          What these stats mean
        </Link>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ header

function Header({ g, report, live }: { g: GameLanding; report: GameReport | null; live: boolean }) {
  const final = g.gameState === "OFF" || g.gameState === "FINAL";
  const suffix = final && g.gameOutcome?.lastPeriodType && g.gameOutcome.lastPeriodType !== "REG" ? ` (${g.gameOutcome.lastPeriodType})` : "";
  const clock = live && g.clock ? `${g.periodDescriptor ? (g.periodDescriptor.number <= 3 ? `P${g.periodDescriptor.number}` : "OT") : ""} · ${g.clock.inIntermission ? "Intermission" : g.clock.timeRemaining}` : "";
  return (
    <header className="overflow-hidden rounded-xl bg-header text-header-fg">
      <div className="px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-header-accent">
          {live ? <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-loss align-middle" aria-hidden /> : null}
          {STATE[g.gameState] ?? g.gameState}
          {suffix} {clock && `· ${clock}`}
        </p>
        <h1 className="sr-only">
          {g.awayTeam.abbrev} at {g.homeTeam.abbrev} game report
        </h1>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          {[g.awayTeam, null, g.homeTeam].map((t, i) =>
            t ? (
              <div key={t.abbrev} className="flex flex-col items-center gap-1">
                <TeamLogo abbrev={t.abbrev} logo={t.logo} darkLogo={t.darkLogo} size={56} />
                <span className="display text-xl sm:text-2xl">{txt(t.commonName, t.abbrev)}</span>
              </div>
            ) : (
              <div key={i}>
                {g.awayTeam.score !== undefined ? (
                  <span className="numeral text-5xl sm:text-6xl">
                    {g.awayTeam.score}–{g.homeTeam.score}
                  </span>
                ) : (
                  <span className="display-hero text-4xl text-header-accent">@</span>
                )}
              </div>
            ),
          )}
        </div>
        <p className="mt-3 text-center text-sm opacity-85">
          {formatGameDate(g.startTimeUTC, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · {formatGameTime(g.startTimeUTC)} MT ·{" "}
          {txt(g.venue)}
        </p>
        {report?.summary && <p className="mx-auto mt-4 max-w-3xl text-center text-base sm:text-lg">{report.summary}</p>}
      </div>
      <div className="sleeve-stripes-thin" aria-hidden />
    </header>
  );
}

// ------------------------------------------------------------------ comparison

function Comparison({ us, them }: { us: TeamTotals; them: TeamTotals }) {
  const rows: { label: string; us: number; them: number; fmt: (n: number) => string; note?: string }[] = [
    { label: "Goals", us: us.goals, them: them.goals, fmt: String },
    { label: "Expected goals", us: us.xg, them: them.xg, fmt: f2 },
    { label: "5-on-5 expected goals", us: us.xg5, them: them.xg5, fmt: f2 },
    { label: "High-danger chances", us: us.hd, them: them.hd, fmt: String },
    { label: "Shots on goal", us: us.sog, them: them.sog, fmt: String },
    { label: "Shot attempts", us: us.attempts, them: them.attempts, fmt: String },
    { label: "5-on-5 shot attempts", us: us.attempts5, them: them.attempts5, fmt: String },
    { label: "Power-play time", us: us.ppSeconds, them: them.ppSeconds, fmt: mmss },
  ];
  return (
    <Module title="Team comparison">
      <div className="mb-3 grid grid-cols-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        <span>{us.abbrev}</span>
        <span className="text-right">{them.abbrev}</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const share = pct(r.us, r.them);
          return (
            <li key={r.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="numeral text-base">{r.fmt(r.us)}</span>
                <span className="text-xs font-semibold text-fg-muted">{r.label}</span>
                <span className="numeral text-base">{r.fmt(r.them)}</span>
              </div>
              <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <span className="bg-us" style={{ width: `${share}%` }} />
                <span className="bg-them" style={{ width: `${100 - share}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-fg-muted">
        5-on-5 shares for {us.abbrev}: {f1(pct(us.attempts5, them.attempts5))}% of shot attempts, {f1(pct(us.xg5, them.xg5))}% of expected goals.
      </p>
    </Module>
  );
}

// ------------------------------------------------------------------ timeline

function Timeline({ report, usSide }: { report: GameReport; usSide: Side }) {
  const other: Side = usSide === "home" ? "away" : "home";
  const rows: XgRow[] = report.timeline.map((p) => ({ minute: p.minute, us: p[usSide], them: p[other] }));
  const goals: XgGoal[] = report.goals.map((gl) => {
    const side = gl.side === usSide ? "us" : "them";
    // Cumulative xG for the scoring team right after the goal.
    const at = [...rows].reverse().find((r) => r.minute <= gl.minute + 1e-9);
    return { minute: gl.minute, y: at ? at[side] : 0, side, label: gl.scorer, value: gl.xg };
  });
  const us = report[usSide];
  const them = report[other];
  return (
    <>
      <XgTimeline
        rows={rows}
        goals={goals}
        periods={report.periods}
        names={{ us: us.name, them: them.name }}
        ariaLabel={`Cumulative expected goals: ${us.name} ${f2(us.xg)}, ${them.name} ${f2(them.xg)}`}
      />
      <p className="mt-2 text-xs text-fg-muted">
        Each step is a shot; the bigger the step, the better the chance. A goal on a small step was a low-percentage finish.
      </p>
    </>
  );
}

function rinkShots(report: GameReport, usSide: Side): RinkShot[] {
  return report.shots
    .filter((s) => s.type !== "blocked-shot" && s.x !== null && s.y !== null)
    .map((s) => ({
      x: s.x!,
      y: s.y!,
      xg: s.xg,
      goal: s.isGoal,
      side: s.side === usSide ? "us" : "them",
      title: `${s.shooter}: ${s.isGoal ? "goal" : s.type === "missed-shot" ? "missed" : "shot on goal"}, ${f2(s.xg)} xG${s.highDanger ? ", high danger" : ""} (P${s.period > 3 ? "OT" : s.period} ${mmss(s.gameSeconds - Math.min(s.period - 1, 3) * 1200)})`,
    }));
}

// ------------------------------------------------------------------ tables

function ByStrength({ report, usSide, themSide }: { report: GameReport; usSide: Side; themSide: Side }) {
  const us = report[usSide].abbrev;
  const them = report[themSide].abbrev;
  return (
    <Module title="By strength">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <caption className="sr-only">Time, shot attempts, expected goals and goals by strength, from {us}&apos;s point of view</caption>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-fg-muted">
              <th className="px-1 py-1 font-semibold">{us} at…</th>
              <th className="px-1 py-1 text-right font-semibold">Time</th>
              <th className="px-1 py-1 text-right font-semibold">Attempts</th>
              <th className="px-1 py-1 text-right font-semibold">xG</th>
              <th className="px-1 py-1 text-right font-semibold">Goals</th>
            </tr>
          </thead>
          <tbody>
            {report.strength.map((r) => (
              <tr key={r.strength} className="border-t border-line">
                <th scope="row" className="px-1 py-1.5 text-left font-semibold">
                  {r.label}
                </th>
                <td className="numeral px-1 text-right">{mmss(r.seconds[usSide])}</td>
                <td className="numeral px-1 text-right">
                  {r.attempts[usSide]}–{r.attempts[themSide]}
                </td>
                <td className="numeral px-1 text-right">
                  {f2(r.xg[usSide])}–{f2(r.xg[themSide])}
                </td>
                <td className="numeral px-1 text-right">
                  {r.goals[usSide]}–{r.goals[themSide]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-fg-muted">
        Read pairs as {us}–{them}. &ldquo;Power play&rdquo; means {us} had the extra skater.
      </p>
    </Module>
  );
}

function Goalies({ report, href }: { report: GameReport; href: (id: number) => string }) {
  return (
    <Module title="Goaltending">
      {report.goalies.length === 0 ? (
        <p className="text-sm text-fg-muted">No shots on goal yet.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <caption className="sr-only">Goalie results with expected goals against</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-fg-muted">
                <th className="px-1 py-1 font-semibold">Goalie</th>
                <th className="px-1 py-1 text-right font-semibold">Saves</th>
                <th className="px-1 py-1 text-right font-semibold">SV%</th>
                <th className="px-1 py-1 text-right font-semibold" title="Expected goals against">xGA</th>
                <th className="px-1 py-1 text-right font-semibold" title="Goals saved above expected">GSAx</th>
              </tr>
            </thead>
            <tbody>
              {report.goalies.map((gl) => (
                <tr key={gl.id} className="border-t border-line">
                  <th scope="row" className="px-1 py-1.5 text-left font-semibold">
                    <Link href={href(gl.id)} className="hover:underline">
                      {gl.name}
                    </Link>{" "}
                    <span className="text-xs font-normal text-fg-muted">{report[gl.side].abbrev}</span>
                  </th>
                  <td className="numeral px-1 text-right">
                    {gl.saves}/{gl.shotsFaced}
                  </td>
                  <td className="numeral px-1 text-right">{savePct(gl.svPct)}</td>
                  <td className="numeral px-1 text-right">{f2(gl.xga)}</td>
                  <td className={`numeral px-1 text-right ${gl.gsax >= 0 ? "text-win" : "text-loss"}`}>
                    {gl.gsax > 0 ? "+" : ""}
                    {f2(gl.gsax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-fg-muted">GSAx above zero means the goalie stopped more than an average goalie would have, given the shots faced.</p>
    </Module>
  );
}

const RATING_COLUMNS: Column[] = [
  { key: "rating", label: "Rating", title: "Player rating out of 10, from Game Score compared with every NHL game of the last two seasons", format: "rating" },
  { key: "gs", label: "GS", title: "Game Score: the raw single-game score the rating comes from", format: "dec2" },
  { key: "g", label: "G", title: "Goals", format: "int" },
  { key: "a", label: "A", title: "Assists", format: "int" },
  { key: "sog", label: "SOG", title: "Shots on goal", format: "int" },
  { key: "toi", label: "TOI", title: "Time on ice", format: "toi" },
  { key: "cf", label: "Shot share", title: "On-ice shot share at 5 on 5: the team's share of shot attempts while he was on the ice (CF%)", format: "pct1" },
];

/** Both teams' players with their rating out of 10; the top three of the night are highlighted. */
function PlayerRatings({
  ratings,
  report,
  names,
  href,
}: {
  ratings: RatedGame[];
  report: GameReport;
  names: (id: number) => string;
  href: (id: number) => string;
}) {
  const abbrev = (teamId: number) => (teamId === report.home.id ? report.home.abbrev : report.away.abbrev);
  const top = new Set(ratings.slice(0, 3).map((r) => r.playerId));
  // Oilers first in the filter and the averages; "ours" marks their rows.
  const sides = [report.home, report.away].sort((a, b) => Number(b.abbrev === TEAM) - Number(a.abbrev === TEAM));
  const average = (teamId: number) => {
    const mine = ratings.filter((r) => r.teamId === teamId);
    return mine.length ? mine.reduce((s, r) => s + r.rating, 0) / mine.length : null;
  };
  const rows: TableRow[] = ratings.map((r) => ({
    id: r.playerId,
    name: names(r.playerId),
    href: href(r.playerId),
    pos: r.pos,
    team: abbrev(r.teamId),
    highlight: top.has(r.playerId) ? 1 : 0,
    ours: abbrev(r.teamId) === TEAM ? 1 : 0,
    rating: r.rating,
    gs: r.gameScore,
    g: r.goals,
    a: r.a1 + r.a2,
    sog: r.pos === "G" ? null : r.sog,
    toi: r.toi,
    cf: r.pos === "G" || r.cf + r.ca === 0 ? null : (100 * r.cf) / (r.cf + r.ca),
  }));
  return (
    <Module title="Player ratings">
      <p className="mb-3 text-xs text-fg-muted">
        Out of 10, from each player&apos;s Game Score (goals, assists, shots, blocks, penalties, faceoffs and 5-on-5 shot and goal differential while on the
        ice) compared with every NHL game of the last two seasons. 6 is above average, 7 very good, 8 excellent. Goalies are rated on goals saved above
        expected. ★ = top three of the night; Oilers have an orange bar.{" "}
        <Link href="/stats-guide#ratings" className="underline">
          How ratings work
        </Link>
      </p>
      <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Average rating</span>
        {sides.map((t) => {
          const avg = average(t.id);
          return avg === null ? null : (
            <span key={t.id} className="inline-flex items-center gap-2">
              <span className={t.abbrev === TEAM ? "font-semibold text-accent-ink" : ""}>{t.name}</span>
              <RatingBadge rating={Math.round(avg * 10) / 10} />
            </span>
          );
        })}
      </p>
      <SortableTable
        columns={RATING_COLUMNS}
        rows={rows}
        initialSort="rating"
        caption="Player ratings for both teams"
        minWidth="36rem"
        teamFilter={{ label: "Show players from", options: sides.map((t) => ({ key: t.abbrev, label: t.name })) }}
      />
    </Module>
  );
}

const mmss5 = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function UnitList({ title, units, names }: { title: string; units: Unit[]; names: (id: number, short?: boolean) => string }) {
  if (!units.length) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{title}</p>
      <ul className="space-y-1.5 text-sm">
        {units.map((u) => (
          <li key={u.players.join("-")} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">{u.players.map((id) => names(id, true)).join(" – ")}</span>
            <span className="numeral whitespace-nowrap text-xs text-fg-muted" title="5-on-5 time together · shot attempts for–against · expected goals for–against">
              {mmss5(u.toi5)} · {u.cf}–{u.ca} · xG {u.xgf.toFixed(1)}–{u.xga.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The forward lines and defence pairs each team actually used, from who was on the ice together. */
function LinesTonight({
  gameId,
  report,
  usSide,
  themSide,
  names,
}: {
  gameId: number;
  report: GameReport;
  usSide: Side;
  themSide: Side;
  names: (id: number, short?: boolean) => string;
}) {
  return (
    <Module title="Lines used tonight">
      <p className="mb-3 text-xs text-fg-muted">
        Each team&apos;s most-used forward lines and defence pairs at 5 on 5, from the NHL&apos;s shift charts · time together · shot attempts for–against
        · expected goals for–against
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {[usSide, themSide].map((side) => {
          const team = report[side];
          const { lines, pairs } = regularUnits(gameUnits(gameId, team.id));
          return (
            <div key={side} className="space-y-3">
              <p className="display text-xl">{team.name}</p>
              <UnitList title="Forward lines" units={lines} names={names} />
              <UnitList title="Defence pairs" units={pairs} names={names} />
            </div>
          );
        })}
      </div>
    </Module>
  );
}

function TopShooters({ report, href, pending }: { report: GameReport; href: (id: number) => string; pending: boolean }) {
  const top = report.players.slice(0, 10);
  return (
    <Module title="Most dangerous shooters">
      {pending && (
        <p className="mb-2 text-xs text-fg-muted">Player ratings and lines appear here once the NHL publishes the game&apos;s shift charts, usually by the next site update.</p>
      )}
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <caption className="sr-only">Players ranked by individual expected goals</caption>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-fg-muted">
              <th className="px-1 py-1 font-semibold">Player</th>
              <th className="px-1 py-1 text-right font-semibold">G</th>
              <th className="px-1 py-1 text-right font-semibold" title="Shots on goal">SOG</th>
              <th className="px-1 py-1 text-right font-semibold" title="Shot attempts">Att</th>
              <th className="px-1 py-1 text-right font-semibold" title="High-danger chances">HD</th>
              <th className="px-1 py-1 text-right font-semibold" title="Individual expected goals">ixG</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <th scope="row" className="px-1 py-1.5 text-left font-semibold">
                  <Link href={href(p.id)} className="hover:underline">
                    {p.name}
                  </Link>{" "}
                  <span className="text-xs font-normal text-fg-muted">{report[p.side].abbrev}</span>
                </th>
                <td className="numeral px-1 text-right">{p.goals}</td>
                <td className="numeral px-1 text-right">{p.shots}</td>
                <td className="numeral px-1 text-right">{p.attempts}</td>
                <td className="numeral px-1 text-right">{p.hd}</td>
                <td className="numeral px-1 text-right">{f2(p.ixg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Module>
  );
}

function ThreeStars({ g, href }: { g: GameLanding; href: (id: number) => string }) {
  const stars = g.summary?.threeStars ?? [];
  if (!stars.length) return null;
  return (
    <Module title="Three stars">
      <ol className="space-y-2">
        {stars.map((s) => (
          <li key={s.star} className="flex items-baseline gap-3">
            <span className="w-12 shrink-0 text-accent-ink">{"★".repeat(s.star)}</span>
            <Link href={href(s.playerId)} className="font-semibold hover:underline">
              {txt(s.name)}
            </Link>
            <span className="text-xs text-fg-muted">
              {s.teamAbbrev}
              {s.position === "G" ? (s.savePctg !== undefined ? ` · ${savePct(s.savePctg)} SV%` : "") : ` · ${s.goals ?? 0}G ${s.assists ?? 0}A`}
            </span>
          </li>
        ))}
      </ol>
    </Module>
  );
}

function Scoring({ g }: { g: GameLanding }) {
  const periods = (g.summary?.scoring ?? []).filter((p) => p.goals.length);
  if (!periods.length) return null;
  const label = (n: number, type: string) => (type === "SO" ? "Shootout" : type === "OT" ? "Overtime" : `Period ${n}`);
  return (
    <Module title="Scoring">
      <div className="space-y-3">
        {periods.map((p) => (
          <div key={`${p.periodDescriptor.number}${p.periodDescriptor.periodType}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{label(p.periodDescriptor.number, p.periodDescriptor.periodType)}</p>
            <ul className="mt-1 space-y-1 text-sm">
              {p.goals.map((gl, i) => (
                <li key={gl.eventId ?? i} className="flex gap-3">
                  <span className="numeral w-10 shrink-0 text-fg-muted">{gl.timeInPeriod}</span>
                  <span>
                    <span className="font-semibold">{txt(gl.teamAbbrev)}</span> {txt(gl.name) || txt(gl.lastName)}
                    {gl.strength && gl.strength !== "ev" ? <span className="text-xs uppercase text-fg-muted"> {gl.strength}</span> : null}
                    {gl.assists.length > 0 && (
                      <span className="text-fg-muted"> (from {gl.assists.map((a) => txt(a.name) || txt(a.lastName)).join(", ")})</span>
                    )}
                  </span>
                  <span className="numeral ml-auto text-fg-muted">
                    {gl.awayScore}–{gl.homeScore}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Module>
  );
}
