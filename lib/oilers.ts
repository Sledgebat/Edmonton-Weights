/**
 * Oilers-specific views over NHL data: results, records, next/last game, standings position.
 * Pure functions, so they're unit-tested against the fixtures.
 */
import { TEAM, isFinished, isLive } from "./nhl/endpoints";
import { txt, type ClubSkaterStats, type ScheduleGame, type StandingsRow } from "./nhl/schemas";

export const TZ = "America/Edmonton";

export type Outcome = "W" | "L" | "OTL" | "SOL";

export type TeamGameView = {
  game: ScheduleGame;
  isHome: boolean;
  us: ScheduleGame["homeTeam"];
  opp: ScheduleGame["homeTeam"];
  /** "vs" at home, "@" on the road. */
  prefix: "vs" | "@";
  finished: boolean;
  live: boolean;
  outcome?: Outcome;
  /** "REG" | "OT" | "SO" for finished games. */
  decidedIn?: "REG" | "OT" | "SO";
};

export function teamView(game: ScheduleGame, team = TEAM): TeamGameView {
  const isHome = game.homeTeam.abbrev === team;
  const us = isHome ? game.homeTeam : game.awayTeam;
  const opp = isHome ? game.awayTeam : game.homeTeam;
  const finished = isFinished(game.gameState);
  const view: TeamGameView = { game, isHome, us, opp, prefix: isHome ? "vs" : "@", finished, live: isLive(game.gameState) };
  if (finished && us.score !== undefined && opp.score !== undefined) {
    const decidedIn = game.gameOutcome?.lastPeriodType ?? "REG";
    view.decidedIn = decidedIn;
    view.outcome = us.score > opp.score ? "W" : decidedIn === "SO" ? "SOL" : decidedIn === "OT" ? "OTL" : "L";
  }
  return view;
}

export const GAME_TYPE_LABEL: Record<number, string> = { 1: "Preseason", 2: "Regular season", 3: "Playoffs", 4: "All-Star" };

const byStart = (a: ScheduleGame, b: ScheduleGame) => a.startTimeUTC.localeCompare(b.startTimeUTC);

/** The game currently being played, if any. */
export function liveGame(games: ScheduleGame[]): ScheduleGame | undefined {
  return games.find((g) => isLive(g.gameState));
}

/** The next game that hasn't finished (includes one in progress). */
export function nextGame(games: ScheduleGame[]): ScheduleGame | undefined {
  return [...games].sort(byStart).find((g) => !isFinished(g.gameState));
}

/** The most recent finished game, preferring regular-season/playoff games over preseason. */
export function lastGame(games: ScheduleGame[]): ScheduleGame | undefined {
  const done = [...games].sort(byStart).filter((g) => isFinished(g.gameState));
  return [...done].reverse().find((g) => g.gameType === 2 || g.gameType === 3) ?? done.at(-1);
}

/** W-L-OTL record from finished games of one type. */
export function record(games: ScheduleGame[], gameType = 2, team = TEAM) {
  const r = { w: 0, l: 0, otl: 0 };
  for (const g of games) {
    if (g.gameType !== gameType) continue;
    const v = teamView(g, team);
    if (v.outcome === "W") r.w++;
    else if (v.outcome === "L") r.l++;
    else if (v.outcome) r.otl++;
  }
  return r;
}

export const formatRecord = (r: { w: number; l: number; otl: number }) => `${r.w}-${r.l}-${r.otl}`;

/** Group games by month, in order, labelled like "October 2026" (Edmonton time). */
export function byMonth(games: ScheduleGame[]): { key: string; label: string; games: ScheduleGame[] }[] {
  const fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" });
  const fmtLabel = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "long" });
  const groups = new Map<string, { key: string; label: string; games: ScheduleGame[] }>();
  for (const g of [...games].sort(byStart)) {
    const d = new Date(g.startTimeUTC);
    const key = fmtKey.format(d);
    if (!groups.has(key)) groups.set(key, { key, label: fmtLabel.format(d), games: [] });
    groups.get(key)!.games.push(g);
  }
  return [...groups.values()];
}

// ------------------------------------------------------------------ standings

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const teamOf = (r: StandingsRow) => txt(r.teamAbbrev);

/** "W3", "L1", "OT2", or "" before a team has played. */
export const streakLabel = (r: Pick<StandingsRow, "streakCode" | "streakCount">) =>
  r.streakCode && r.streakCount ? `${r.streakCode}${r.streakCount}` : "";

export const pointPct = (r: StandingsRow) => (r.pointPctg ?? 0).toFixed(3).replace(/^0/, "");

export function divisionTable(rows: StandingsRow[], division: string) {
  return rows.filter((r) => r.divisionAbbrev === division).sort((a, b) => a.divisionSequence - b.divisionSequence);
}

export function conferenceTable(rows: StandingsRow[], conference: string) {
  return rows.filter((r) => r.conferenceAbbrev === conference).sort((a, b) => a.conferenceSequence - b.conferenceSequence);
}

/**
 * Wild card view for a conference: each division's top three, then every other team by
 * wild card rank. The cut line falls after the second wild card.
 */
export function wildCardTable(rows: StandingsRow[], conference: string) {
  const conf = rows.filter((r) => r.conferenceAbbrev === conference);
  const divisions = [...new Set(conf.map((r) => r.divisionAbbrev))].sort();
  const leaders = divisions.map((d) => ({
    division: d,
    name: conf.find((r) => r.divisionAbbrev === d)?.divisionName ?? d,
    rows: divisionTable(conf, d).slice(0, 3),
  }));
  const leaderSet = new Set(leaders.flatMap((l) => l.rows.map(teamOf)));
  const wildCard = conf
    .filter((r) => !leaderSet.has(teamOf(r)))
    .sort((a, b) => (a.wildcardSequence || 99) - (b.wildcardSequence || 99) || a.conferenceSequence - b.conferenceSequence);
  return { leaders, wildCard, cutAfter: 2 };
}

// ------------------------------------------------------------------ team stats

export function topScorers(skaters: ClubSkaterStats[], n = 3) {
  return [...skaters]
    .sort((a, b) => b.points - a.points || b.goals - a.goals || a.gamesPlayed - b.gamesPlayed)
    .slice(0, n);
}

// ------------------------------------------------------------------ formatting

export function formatGameTime(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit", ...opts }).format(new Date(iso));
}

export function formatGameDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...opts }).format(new Date(iso));
}

/** Age in whole years on `now`. */
export function age(birthDate: string, now = new Date()) {
  const b = new Date(birthDate + "T00:00:00Z");
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

export const heightFtIn = (inches: number) => `${Math.floor(inches / 12)}′${inches % 12}″`;

/** "20262027" -> "2026-27". */
export const seasonShort = (season: number) => {
  const s = Math.floor(season / 10000);
  return `${s}-${String((s + 1) % 100).padStart(2, "0")}`;
};

export const savePct = (v: number | undefined) => (v === undefined ? "—" : v.toFixed(3).replace(/^0/, ""));
export const gaa = (v: number | undefined) => (v === undefined ? "—" : v.toFixed(2));
export const signed = (n: number | undefined) => (n === undefined ? "—" : n > 0 ? `+${n}` : String(n));
