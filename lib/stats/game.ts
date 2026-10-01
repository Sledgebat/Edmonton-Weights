/**
 * One game's advanced-stats report, computed straight from its play-by-play (so it works for
 * live games and for games not yet stored in the database).
 */
import { txt, type GameLanding, type PlayByPlay } from "@/lib/nhl/schemas";
import { extractShots, gameSecondsOf, strengthTime, type ShotAttempt, type Strength } from "./extract";
import { scoreShots } from "./xg";

export type Side = "home" | "away";

export type TeamTotals = {
  id: number;
  abbrev: string;
  name: string;
  goals: number;
  xg: number;
  xg5: number;
  sog: number;
  attempts: number;
  attempts5: number;
  unblocked: number;
  hd: number;
  hd5: number;
  ppSeconds: number;
};

export type StrengthRow = {
  strength: "5v5" | "PP" | "SH" | "Other";
  label: string;
  seconds: Record<Side, number>;
  attempts: Record<Side, number>;
  xg: Record<Side, number>;
  goals: Record<Side, number>;
  hd: Record<Side, number>;
};

export type TimelinePoint = { minute: number; home: number; away: number };
export type GoalMark = { minute: number; side: Side; scorer: string; xg: number };

export type PlayerLine = {
  id: number;
  name: string;
  number?: number;
  position: string;
  side: Side;
  attempts: number;
  shots: number;
  goals: number;
  ixg: number;
  hd: number;
};

export type GoalieLine = {
  id: number;
  name: string;
  side: Side;
  shotsFaced: number;
  goalsAllowed: number;
  saves: number;
  svPct: number;
  xga: number;
  gsax: number;
};

export type GameReport = {
  gameId: number;
  state: string;
  home: TeamTotals;
  away: TeamTotals;
  shots: (ShotAttempt & { side: Side; shooter: string })[];
  timeline: TimelinePoint[];
  goals: GoalMark[];
  periods: number[];
  strength: StrengthRow[];
  players: PlayerLine[];
  goalies: GoalieLine[];
  decidedIn: "REG" | "OT" | "SO";
  summary: string;
};

const r1 = (n: number) => n.toFixed(1);

export function analyzeGame(pbp: PlayByPlay, landing?: GameLanding | null): GameReport {
  const homeId = pbp.homeTeam.id;
  const sideOf = (teamId: number): Side => (teamId === homeId ? "home" : "away");
  const roster = new Map(pbp.rosterSpots.map((p) => [p.playerId, p]));
  const nameOf = (id: number | null | undefined) => {
    const p = id ? roster.get(id) : undefined;
    return p ? `${txt(p.firstName)} ${txt(p.lastName)}` : id ? `#${id}` : "Unknown";
  };

  const shots = scoreShots(extractShots(pbp)).map((s) => ({ ...s, side: sideOf(s.teamId), shooter: nameOf(s.shooterId) }));
  const time = strengthTime(pbp);

  const totals = (side: Side): TeamTotals => {
    const t = side === "home" ? pbp.homeTeam : pbp.awayTeam;
    const mine = shots.filter((s) => s.side === side);
    const five = mine.filter((s) => s.strength === "5v5");
    return {
      id: t.id,
      abbrev: t.abbrev,
      name: txt(t.commonName, t.abbrev),
      goals: t.score ?? mine.filter((s) => s.isGoal).length,
      xg: mine.reduce((a, s) => a + s.xg, 0),
      xg5: five.reduce((a, s) => a + s.xg, 0),
      sog: mine.filter((s) => s.type === "shot-on-goal" || s.isGoal).length,
      attempts: mine.length,
      attempts5: five.length,
      unblocked: mine.filter((s) => s.type !== "blocked-shot").length,
      hd: mine.filter((s) => s.highDanger).length,
      hd5: five.filter((s) => s.highDanger).length,
      ppSeconds: time.get(t.id)?.PP ?? 0,
    };
  };
  const home = totals("home");
  const away = totals("away");

  // Cumulative xG over game time, one point per shot, plus period breaks.
  const timeline: TimelinePoint[] = [{ minute: 0, home: 0, away: 0 }];
  const goals: GoalMark[] = [];
  let h = 0;
  let a = 0;
  for (const s of [...shots].sort((x, y) => x.sortOrder - y.sortOrder)) {
    if (s.xg <= 0) continue;
    if (s.side === "home") h += s.xg;
    else a += s.xg;
    const minute = s.gameSeconds / 60;
    timeline.push({ minute, home: h, away: a });
    if (s.isGoal) goals.push({ minute, side: s.side, scorer: s.shooter, xg: s.xg });
  }
  const lastPlay = [...pbp.plays].filter((p) => p.periodDescriptor.periodType !== "SO").sort((x, y) => y.sortOrder - x.sortOrder)[0];
  const endMinute = lastPlay ? gameSecondsOf(lastPlay) / 60 : 60;
  timeline.push({ minute: Math.max(endMinute, timeline.at(-1)!.minute), home: h, away: a });
  const maxPeriod = Math.max(3, ...pbp.plays.filter((p) => p.periodDescriptor.periodType !== "SO").map((p) => p.periodDescriptor.number));
  const periods = Array.from({ length: maxPeriod - 1 }, (_, i) => (i + 1) * 20);

  // By strength, from each team's point of view: their power play is the other side's penalty kill.
  const bucket = (s: Strength): StrengthRow["strength"] => (s === "5v5" ? "5v5" : s === "PP" ? "PP" : s === "SH" ? "SH" : "Other");
  const rows: StrengthRow[] = (
    [
      ["5v5", "5 on 5"],
      ["PP", "Power play"],
      ["SH", "Shorthanded"],
      ["Other", "Other (4 on 4, 3 on 3, empty net)"],
    ] as const
  ).map(([strength, label]) => {
    const zero = () => ({ home: 0, away: 0 });
    const row: StrengthRow = { strength, label, seconds: zero(), attempts: zero(), xg: zero(), goals: zero(), hd: zero() };
    for (const side of ["home", "away"] as const) {
      const t = time.get(side === "home" ? homeId : pbp.awayTeam.id);
      if (t) row.seconds[side] = strength === "Other" ? t.EV + t.EN : t[strength];
    }
    for (const s of shots) {
      if (bucket(s.strength) !== strength) continue;
      row.attempts[s.side]++;
      row.xg[s.side] += s.xg;
      row.goals[s.side] += s.isGoal ? 1 : 0;
      row.hd[s.side] += s.highDanger ? 1 : 0;
    }
    return row;
  });

  // Individual shooting.
  const byPlayer = new Map<number, PlayerLine>();
  for (const s of shots) {
    if (!s.shooterId) continue;
    const p = roster.get(s.shooterId);
    const line =
      byPlayer.get(s.shooterId) ??
      ({ id: s.shooterId, name: s.shooter, number: p?.sweaterNumber, position: p?.positionCode ?? "", side: s.side, attempts: 0, shots: 0, goals: 0, ixg: 0, hd: 0 } as PlayerLine);
    line.attempts++;
    if (s.type === "shot-on-goal" || s.isGoal) line.shots++;
    if (s.isGoal) line.goals++;
    line.ixg += s.xg;
    if (s.highDanger) line.hd++;
    byPlayer.set(s.shooterId, line);
  }
  const players = [...byPlayer.values()].sort((x, y) => y.ixg - x.ixg);

  // Goalies: shots on goal faced, goals, and expected goals faced (unblocked attempts).
  const byGoalie = new Map<number, GoalieLine>();
  for (const s of shots) {
    if (!s.goalieId || s.type === "blocked-shot") continue;
    const g =
      byGoalie.get(s.goalieId) ??
      ({ id: s.goalieId, name: nameOf(s.goalieId), side: s.side === "home" ? "away" : "home", shotsFaced: 0, goalsAllowed: 0, saves: 0, svPct: 0, xga: 0, gsax: 0 } as GoalieLine);
    if (s.type === "shot-on-goal" || s.isGoal) g.shotsFaced++;
    if (s.isGoal) g.goalsAllowed++;
    g.xga += s.xg;
    byGoalie.set(s.goalieId, g);
  }
  const goalies = [...byGoalie.values()].map((g) => ({
    ...g,
    saves: g.shotsFaced - g.goalsAllowed,
    svPct: g.shotsFaced ? (g.shotsFaced - g.goalsAllowed) / g.shotsFaced : 0,
    gsax: g.xga - g.goalsAllowed,
  }));

  const decidedIn = pbp.gameOutcome?.lastPeriodType ?? landing?.gameOutcome?.lastPeriodType ?? "REG";
  const report: GameReport = {
    gameId: pbp.id,
    state: pbp.gameState,
    home,
    away,
    shots,
    timeline,
    goals,
    periods,
    strength: rows,
    players,
    goalies,
    decidedIn,
    summary: "",
  };
  report.summary = summarize(report);
  return report;
}

/** One plain-language sentence on how the game went. */
export function summarize(r: GameReport): string {
  const finished = r.state === "OFF" || r.state === "FINAL";
  const live = r.state === "LIVE" || r.state === "CRIT";
  if (!finished && !live) return "";
  const [lead, trail] = r.home.goals >= r.away.goals ? [r.home, r.away] : [r.away, r.home];
  const tied = r.home.goals === r.away.goals;
  const xgLead = r.home.xg >= r.away.xg ? r.home : r.away;
  const xgTrail = xgLead === r.home ? r.away : r.home;
  const hdLead = r.home.hd >= r.away.hd ? r.home : r.away;
  const hdTrail = hdLead === r.home ? r.away : r.home;
  const suffix = r.decidedIn === "OT" ? " in overtime" : r.decidedIn === "SO" ? " in a shootout" : "";
  const xgGap = Math.abs(r.home.xg - r.away.xg);
  const hdClause = hdLead.hd !== hdTrail.hd ? ` and ${hdLead.hd}–${hdTrail.hd} in high-danger chances` : "";

  if (live) {
    const score = tied ? `Tied ${lead.goals}–${trail.goals}` : `${lead.name} lead ${lead.goals}–${trail.goals}`;
    return `${score}. ${xgLead.name} have the better chances so far: ${r1(xgLead.xg)}–${r1(xgTrail.xg)} in expected goals${hdClause}.`;
  }

  if (xgGap < 0.4) {
    return `${lead.name} beat the ${trail.name} ${lead.goals}–${trail.goals}${suffix} in an even game: expected goals were ${r1(xgLead.xg)}–${r1(xgTrail.xg)}${hdClause}.`;
  }
  if (xgLead === lead) {
    return `${lead.name} beat the ${trail.name} ${lead.goals}–${trail.goals}${suffix} and earned it, out-chancing them ${r1(lead.xg)}–${r1(trail.xg)} in expected goals${hdLead === lead ? hdClause : ""}.`;
  }
  // The team with the better chances lost: say why, if goaltending explains it.
  const hotGoalie = r.goalies.filter((g) => g.side === (lead === r.home ? "home" : "away")).sort((x, y) => y.gsax - x.gsax)[0];
  const why = hotGoalie && hotGoalie.gsax >= 1 ? ` ${hotGoalie.name} saved ${r1(hotGoalie.gsax)} goals more than expected.` : " Finishing made the difference.";
  return `${lead.name} beat the ${trail.name} ${lead.goals}–${trail.goals}${suffix} despite being out-chanced ${r1(trail.xg)}–${r1(lead.xg)} in expected goals${hdLead === trail ? hdClause : ""}.${why}`;
}
