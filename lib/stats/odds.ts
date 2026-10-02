/**
 * Playoff odds: play out the rest of the regular season many times and count how often each
 * team makes it. An estimate, recalculated at every site update and saved so the site can show
 * how a team's odds moved over the season.
 *
 *   Team strength  a goal share (0.5 = average): 60% expected-goals share (all situations, our
 *                  model) + 40% actual goal share, pulled toward average early in the season
 *                  (weight = games played / (games played + 40)). This season only. Because a
 *                  few games can't tell us how good a team really is, every simulated season
 *                  also draws each team's strength around that estimate, widely in October and
 *                  narrowly by spring.
 *   One game       each team's chance of beating an average team is s² / (s² + (1−s)²); two
 *                  teams are combined with log5, plus a small home-ice edge. 23% of games go to
 *                  overtime or a shootout (loser gets a point), and those are closer to a coin flip.
 *   Playoffs       top three in each division plus two wild cards per conference, by points,
 *                  then regulation wins, then a coin flip (the NHL's later tiebreakers aren't modelled).
 *
 * The simulation itself is pure and seeded, so the same inputs always give the same odds.
 */
import { getDb } from "@/db";

/** Regular-season length when the schedule can't tell us (84 from 2026-27). */
export const SEASON_GAMES = 84;
export const RUNS = 10_000;
/** Games of evidence at which this season's numbers count half. */
export const REGRESS_GAMES = 40;
/** How far NHL teams' true goal shares spread around 50% (one standard deviation). */
export const TALENT_SD = 0.03;
export const HOME_EDGE = 0.035;
export const OT_SHARE = 0.23;

export type OddsTeam = {
  abbrev: string;
  conference: string;
  division: string;
  gp: number;
  points: number;
  regulationWins: number;
  /** Goal share against an average team, 0–1 (0.5 = average). */
  strength: number;
};

/** A remaining game. */
export type Fixture = { home: string; away: string };

export type TeamOdds = { abbrev: string; odds: number; projPoints: number };

/** Team strength from this season's expected-goals and goal shares, regressed toward average. */
export function strengthOf(gp: number, xgShare: number | null, goalShare: number | null): number {
  const parts = [
    [xgShare, 0.6],
    [goalShare, 0.4],
  ].filter((p): p is [number, number] => p[0] !== null && Number.isFinite(p[0]));
  if (!parts.length || gp <= 0) return 0.5;
  const blended = parts.reduce((s, [v, w]) => s + v * w, 0) / parts.reduce((s, [, w]) => s + w, 0);
  const weight = gp / (gp + REGRESS_GAMES);
  return 0.5 + weight * (blended - 0.5);
}

/** Chance that a team of strength s beats an average team. */
export const vsAverage = (s: number) => (s * s) / (s * s + (1 - s) * (1 - s));

/** Chance the home team wins (in regulation, overtime or a shootout). */
export function homeWinChance(home: number, away: number): number {
  const a = vsAverage(home);
  const b = vsAverage(away);
  const p = (a * (1 - b)) / (a * (1 - b) + b * (1 - a));
  return Math.min(0.97, Math.max(0.03, p + HOME_EDGE));
}

/** Small fast seeded random numbers (mulberry32). */
export function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** The season length the schedule implies: the most common games played + games left. */
export function seasonLength(teams: OddsTeam[], scheduled: number[]): number {
  const counts = new Map<number, number>();
  teams.forEach((t, i) => counts.set(t.gp + scheduled[i], (counts.get(t.gp + scheduled[i]) ?? 0) + 1));
  const [len, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [SEASON_GAMES, 0];
  return n >= teams.length / 2 && len >= 60 ? len : SEASON_GAMES;
}

/**
 * Simulate the rest of the season `runs` times. Teams whose listed fixtures don't cover the
 * whole season (a schedule couldn't be loaded) play their missing games against an average team.
 */
export function simulate(teams: OddsTeam[], fixtures: Fixture[], { runs = RUNS, seed = 84 } = {}): TeamOdds[] {
  const n = teams.length;
  const index = new Map(teams.map((t, i) => [t.abbrev, i]));
  const games = fixtures.filter((f) => index.has(f.home) && index.has(f.away)).map((f) => [index.get(f.home)!, index.get(f.away)!] as const);
  const scheduled = Array<number>(n).fill(0);
  for (const [h, a] of games) {
    scheduled[h]++;
    scheduled[a]++;
  }
  const length = seasonLength(teams, scheduled);
  const filler = teams.map((t, i) => Math.max(0, length - t.gp - scheduled[i]));
  // Uncertainty about each team's true strength: wide before any games, narrowing as they're played.
  const spread = teams.map((t) => TALENT_SD * Math.sqrt(REGRESS_GAMES / (t.gp + REGRESS_GAMES)));
  const strength = new Float64Array(n);
  const vsAvg = new Float64Array(n);

  // Each conference's divisions, for the playoff format.
  const conferences = [...new Set(teams.map((t) => t.conference))].map((c) => {
    const members = teams.map((t, i) => (t.conference === c ? i : -1)).filter((i) => i >= 0);
    const divisions = [...new Set(members.map((i) => teams[i].division))].map((d) => members.filter((i) => teams[i].division === d));
    return { members, divisions };
  });

  const rand = seeded(seed);
  const made = Array<number>(n).fill(0);
  const pointSum = Array<number>(n).fill(0);
  const pts = new Float64Array(n);
  const rw = new Float64Array(n);
  const tie = new Float64Array(n);
  const order = (a: number, b: number) => pts[b] - pts[a] || rw[b] - rw[a] || tie[b] - tie[a];

  const play = (winner: number, loser: number | null, ot: boolean) => {
    pts[winner] += 2;
    if (!ot) rw[winner]++;
    if (ot && loser !== null) pts[loser] += 1;
  };

  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  for (let run = 0; run < runs; run++) {
    for (let i = 0; i < n; i++) {
      pts[i] = teams[i].points;
      rw[i] = teams[i].regulationWins;
      tie[i] = rand();
      strength[i] = Math.min(0.75, Math.max(0.25, teams[i].strength + spread[i] * normal()));
      vsAvg[i] = vsAverage(strength[i]);
    }
    for (let g = 0; g < games.length; g++) {
      const [h, a] = games[g];
      const x = vsAvg[h];
      const y = vsAvg[a];
      const pHome = Math.min(0.97, Math.max(0.03, (x * (1 - y)) / (x * (1 - y) + y * (1 - x)) + HOME_EDGE));
      const ot = rand() < OT_SHARE;
      const p = ot ? 0.5 + (pHome - 0.5) * 0.5 : pHome;
      if (rand() < p) play(h, a, ot);
      else play(a, h, ot);
    }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < filler[i]; k++) {
        const ot = rand() < OT_SHARE;
        const p = ot ? 0.5 + (vsAvg[i] - 0.5) * 0.5 : vsAvg[i];
        if (rand() < p) play(i, null, ot);
        else if (ot) pts[i] += 1;
      }
    }
    for (const c of conferences) {
      const leaders = new Set<number>();
      for (const d of c.divisions) for (const i of [...d].sort(order).slice(0, 3)) leaders.add(i);
      const wild = c.members.filter((i) => !leaders.has(i)).sort(order).slice(0, 2);
      for (const i of leaders) made[i]++;
      for (const i of wild) made[i]++;
    }
    for (let i = 0; i < n; i++) pointSum[i] += pts[i];
  }

  return teams.map((t, i) => ({ abbrev: t.abbrev, odds: made[i] / runs, projPoints: pointSum[i] / runs }));
}

// ------------------------------------------------------------------ inputs

type StandingsLike = {
  teamAbbrev: { default: string };
  conferenceAbbrev: string;
  divisionAbbrev: string;
  gamesPlayed: number;
  points: number;
  regulationWins: number;
  goalFor: number;
  goalAgainst: number;
};
type GameLike = { id: number; gameType: number; gameState: string; homeTeam: { abbrev: string }; awayTeam: { abbrev: string } };

/** Each team's all-situations expected-goals share this season, from stored shots. */
export function xgShares(season: number): Map<string, number> {
  const db = getDb().$client;
  const abbrevOf = new Map<number, string>();
  for (const r of db.prepare(`SELECT home_id id, home_abbrev a FROM stats_games WHERE season = ? UNION SELECT away_id, away_abbrev FROM stats_games WHERE season = ?`).all(season, season) as {
    id: number;
    a: string;
  }[])
    abbrevOf.set(r.id, r.a);
  const sum = (col: string) =>
    new Map((db.prepare(`SELECT ${col} t, SUM(xg) xg FROM shots WHERE season = ? AND game_type = 2 GROUP BY ${col}`).all(season) as { t: number; xg: number }[]).map((r) => [r.t, r.xg]));
  const f = sum("team_id");
  const a = sum("opp_team_id");
  const out = new Map<string, number>();
  for (const [id, abbrev] of abbrevOf) {
    const x = f.get(id) ?? 0;
    const y = a.get(id) ?? 0;
    if (x + y > 0) out.set(abbrev, x / (x + y));
  }
  return out;
}

/** Simulation inputs from the standings, the season's schedule and stored shots. */
export function oddsInputs(season: number, standings: StandingsLike[], schedule: GameLike[]): { teams: OddsTeam[]; fixtures: Fixture[] } {
  const xg = xgShares(season);
  const teams = standings.map((r) => {
    const abbrev = r.teamAbbrev.default;
    const goals = r.goalFor + r.goalAgainst;
    return {
      abbrev,
      conference: r.conferenceAbbrev,
      division: r.divisionAbbrev,
      gp: r.gamesPlayed,
      points: r.points,
      regulationWins: r.regulationWins,
      strength: strengthOf(r.gamesPlayed, xg.get(abbrev) ?? null, goals > 0 ? r.goalFor / goals : null),
    };
  });
  const seen = new Set<number>();
  const fixtures: Fixture[] = [];
  for (const g of schedule) {
    // Unplayed regular-season games; a game in progress isn't in the standings yet either.
    if (g.gameType !== 2 || g.gameState === "FINAL" || g.gameState === "OFF" || seen.has(g.id)) continue;
    seen.add(g.id);
    fixtures.push({ home: g.homeTeam.abbrev, away: g.awayTeam.abbrev });
  }
  return { teams, fixtures };
}

/** Simulate the rest of the season and save everyone's odds. Returns the odds, best first. */
export function runPlayoffOdds(season: number, standings: StandingsLike[], schedule: GameLike[], runAt = Date.now()) {
  const { teams, fixtures } = oddsInputs(season, standings, schedule);
  if (!teams.length) return [];
  const odds = simulate(teams, fixtures);
  const byTeam = new Map(teams.map((t) => [t.abbrev, t]));
  saveOdds(
    season,
    odds.map((o) => ({ ...o, gp: byTeam.get(o.abbrev)!.gp, points: byTeam.get(o.abbrev)!.points })),
    runAt,
  );
  return [...odds].sort((a, b) => b.odds - a.odds);
}

// ------------------------------------------------------------------ stored runs

export type OddsRow = { team: string; gp: number; points: number; odds: number; projPoints: number };

/** Save one update's odds for every team. */
export function saveOdds(season: number, rows: (TeamOdds & { gp: number; points: number })[], runAt = Date.now()) {
  const db = getDb().$client;
  const insert = db.prepare(`INSERT OR REPLACE INTO playoff_odds (run_at, season, team, gp, points, odds, proj_points) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    for (const r of rows) insert.run(runAt, season, r.abbrev, r.gp, r.points, r.odds, r.projPoints);
  })();
}

/** The most recent odds for every team, and when they were calculated. */
export function latestOdds(season: number): { runAt: number; rows: OddsRow[] } | null {
  const db = getDb().$client;
  const last = db.prepare(`SELECT MAX(run_at) t FROM playoff_odds WHERE season = ?`).get(season) as { t: number | null };
  if (!last.t) return null;
  const rows = db
    .prepare(`SELECT team, gp, points, odds, proj_points projPoints FROM playoff_odds WHERE season = ? AND run_at = ? ORDER BY odds DESC, proj_points DESC`)
    .all(season, last.t) as OddsRow[];
  return { runAt: last.t, rows };
}

/** One team's odds over the season: the last calculation of each day (Edmonton time), oldest first. */
export function oddsHistory(season: number, team: string): { date: string; gp: number; odds: number }[] {
  const rows = getDb()
    .$client.prepare(`SELECT run_at runAt, gp, odds FROM playoff_odds WHERE season = ? AND team = ? ORDER BY run_at`)
    .all(season, team) as { runAt: number; gp: number; odds: number }[];
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" });
  const byDay = new Map<string, { date: string; gp: number; odds: number }>();
  for (const r of rows) {
    const date = day.format(new Date(r.runAt));
    byDay.set(date, { date, gp: r.gp, odds: r.odds });
  }
  return [...byDay.values()];
}

// ------------------------------------------------------------------ display

/** "62%", "<1%", ">99%": a simulation can't promise 0 or 100. */
export function formatOdds(odds: number): string {
  const p = Math.round(odds * 100);
  if (p < 1) return "<1%";
  if (p > 99) return ">99%";
  return `${p}%`;
}

/** Green above 50%, red below, plain at exactly even (judged on the number shown). */
export function oddsTone(odds: number): string {
  const p = Math.round(odds * 100);
  return p > 50 ? "text-win" : p < 50 ? "text-loss" : "";
}
