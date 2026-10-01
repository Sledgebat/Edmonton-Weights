import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DataError, Module } from "@/components/data/Module";
import { LiveRefresh } from "@/components/game/LiveRefresh";
import { XgTimeline, type XgGoal, type XgRow } from "@/components/game/XgTimeline";
import { FullRink, type RinkShot } from "@/components/rink/FullRink";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { load } from "@/lib/load";
import { nhl, txt } from "@/lib/nhl";
import { TEAM } from "@/lib/nhl/endpoints";
import type { GameLanding } from "@/lib/nhl/schemas";
import { formatGameDate, formatGameTime, savePct } from "@/lib/oilers";
import { analyzeGame, type GameReport, type Side, type TeamTotals } from "@/lib/stats/game";

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
  await connection();
  const { id } = await params;
  if (!/^\d{10}$/.test(id)) notFound();
  const gameId = Number(id);
  const [landing, pbp] = await Promise.all([load(() => nhl.gameLanding(gameId)), load(() => nhl.playByPlay(gameId))]);
  if (!landing.ok && landing.notFound) notFound();

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
  const report = started && pbp.ok ? analyzeGame(pbp.data, g) : null;
  // "Us" is the Oilers when they play; otherwise the home team.
  const usSide: Side = g.awayTeam.abbrev === TEAM ? "away" : "home";
  const themSide: Side = usSide === "home" ? "away" : "home";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      {live && <LiveRefresh seconds={30} />}
      <Header g={g} report={report} live={live} />

      {!started && (
        <Module title="Report coming at puck drop">
          <p className="text-fg-muted">
            Expected goals, the shot map and high-danger chances fill in as soon as the game starts, and update every 30 seconds while it&apos;s live.
          </p>
          {(g.homeTeam.abbrev === TEAM || g.awayTeam.abbrev === TEAM) && (
            <Link href="/#next" className="btn btn-secondary mt-4">
              Pre-game breakdown on the home page
            </Link>
          )}
        </Module>
      )}

      {started && !report && <DataError what="the play-by-play for this game" error={pbp.ok ? undefined : pbp.error} />}

      {report && (
        <>
          <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
            <Comparison us={report[usSide]} them={report[themSide]} />
            <Module title="Expected goals through the game" meta={pbp.ok ? pbp.meta : undefined}>
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
            <Goalies report={report} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopShooters report={report} />
            <div className="space-y-6">
              <ThreeStars g={g} />
              <Scoring g={g} />
            </div>
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

function Goalies({ report }: { report: GameReport }) {
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
                    <Link href={`/player/${gl.id}`} className="hover:underline">
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

function TopShooters({ report }: { report: GameReport }) {
  const top = report.players.slice(0, 10);
  return (
    <Module title="Most dangerous shooters">
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
                  <Link href={`/player/${p.id}`} className="hover:underline">
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

function ThreeStars({ g }: { g: GameLanding }) {
  const stars = g.summary?.threeStars ?? [];
  if (!stars.length) return null;
  return (
    <Module title="Three stars">
      <ol className="space-y-2">
        {stars.map((s) => (
          <li key={s.star} className="flex items-baseline gap-3">
            <span className="w-12 shrink-0 text-accent-ink">{"★".repeat(s.star)}</span>
            <Link href={`/player/${s.playerId}`} className="font-semibold hover:underline">
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
