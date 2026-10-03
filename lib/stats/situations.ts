/**
 * Game scripts: each game replayed goal by goal (from the stored `goals`, with the final and
 * how it ended from `stats_games`), for any team. One function feeds the Situations tab:
 *
 *   records when scoring first or allowing first, and when leading, tied or trailing after the
 *   1st and the 2nd; one-goal games (final margin 1, or 2 with an empty-net goal); goals for and
 *   against by period; comebacks (wins after trailing by 2+, or trailing after two) and blown
 *   leads (losses, including OT and shootout, after leading by 2+ or leading after two).
 *
 * Regular season only. Shootout goals aren't goals here, but a shootout decides the result.
 */
import { getDb } from "@/db";
import { rankOf } from "@/lib/rank";

export type ScriptGoal = { teamId: number; period: number; periodType: string; periodSeconds: number; eventId: number; emptyNet: boolean };

export type ScriptGame = {
  gameId: number;
  date: string;
  homeId: number;
  awayId: number;
  homeAbbrev: string;
  awayAbbrev: string;
  homeScore: number;
  awayScore: number;
  /** REG, OT or SO. */
  lastPeriodType: string;
  goals: ScriptGoal[];
};

export type Outcome = "W" | "L" | "OTL";

export type GameScript = {
  gameId: number;
  date: string;
  isHome: boolean;
  opponent: string;
  outcome: Outcome;
  /** How the game ended: REG, OT or SO. */
  decidedIn: string;
  gf: number;
  ga: number;
  /** True / false, or null in a 0-0 game decided by a shootout. */
  scoredFirst: boolean | null;
  /** Own goals minus opponent's after the 1st and after the 2nd. */
  after1: number;
  after2: number;
  /** Biggest lead (≥ 0) and biggest deficit (≤ 0) at any point. */
  maxLead: number;
  maxDeficit: number;
  /** Final margin from this team's side (a shootout counts as a one-goal result). */
  margin: number;
  enFor: number;
  enAgainst: number;
  /** Goals in the 1st, 2nd, 3rd and overtime. */
  byPeriodFor: [number, number, number, number];
  byPeriodAgainst: [number, number, number, number];
};

/** Replay one game from a team's point of view. */
export function gameScript(g: ScriptGame, teamId: number): GameScript {
  const isHome = g.homeId === teamId;
  const gf = isHome ? g.homeScore : g.awayScore;
  const ga = isHome ? g.awayScore : g.homeScore;
  const decidedIn = g.lastPeriodType === "SO" ? "SO" : g.lastPeriodType === "OT" ? "OT" : "REG";
  const outcome: Outcome = gf > ga ? "W" : decidedIn === "REG" ? "L" : "OTL";
  const goals = [...g.goals].sort((a, b) => a.period - b.period || a.periodSeconds - b.periodSeconds || a.eventId - b.eventId);
  let own = 0;
  let opp = 0;
  let maxLead = 0;
  let maxDeficit = 0;
  let after1 = 0;
  let after2 = 0;
  let enFor = 0;
  let enAgainst = 0;
  const byPeriodFor: GameScript["byPeriodFor"] = [0, 0, 0, 0];
  const byPeriodAgainst: GameScript["byPeriodAgainst"] = [0, 0, 0, 0];
  const snapshot = (upTo: number) => goals.filter((x) => x.period <= upTo).reduce((d, x) => d + (x.teamId === teamId ? 1 : -1), 0);
  after1 = snapshot(1);
  after2 = snapshot(2);
  for (const x of goals) {
    const slot = Math.min(x.period, 4) - 1;
    if (x.teamId === teamId) {
      own++;
      byPeriodFor[slot]++;
      if (x.emptyNet) enFor++;
    } else {
      opp++;
      byPeriodAgainst[slot]++;
      if (x.emptyNet) enAgainst++;
    }
    maxLead = Math.max(maxLead, own - opp);
    maxDeficit = Math.min(maxDeficit, own - opp);
  }
  return {
    gameId: g.gameId,
    date: g.date,
    isHome,
    opponent: isHome ? g.awayAbbrev : g.homeAbbrev,
    outcome,
    decidedIn,
    gf,
    ga,
    scoredFirst: goals.length ? goals[0].teamId === teamId : null,
    after1,
    after2,
    maxLead,
    maxDeficit,
    margin: gf - ga,
    enFor,
    enAgainst,
    byPeriodFor,
    byPeriodAgainst,
  };
}

// ------------------------------------------------------------------ summaries

export type Record3 = { w: number; l: number; otl: number };

const emptyRecord = (): Record3 => ({ w: 0, l: 0, otl: 0 });
const add = (r: Record3, o: Outcome) => {
  if (o === "W") r.w++;
  else if (o === "L") r.l++;
  else r.otl++;
};
export const gamesIn = (r: Record3) => r.w + r.l + r.otl;
/** Share of available points won (W 2, OT/SO loss 1), or null with no games. */
export const pointsPct = (r: Record3) => (gamesIn(r) ? (2 * r.w + r.otl) / (2 * gamesIn(r)) : null);
export const recordText = (r: Record3) => `${r.w}-${r.l}-${r.otl}`;

export type SituationSummary = {
  games: number;
  scoringFirst: Record3;
  allowingFirst: Record3;
  leadingAfter1: Record3;
  tiedAfter1: Record3;
  trailingAfter1: Record3;
  leadingAfter2: Record3;
  tiedAfter2: Record3;
  trailingAfter2: Record3;
  oneGoal: Record3;
  overtime: Record3;
  shootout: Record3;
  home: Record3;
  road: Record3;
  goalsFor: [number, number, number, number];
  goalsAgainst: [number, number, number, number];
  /** Wins after trailing by 2 or more at some point. */
  comebackWins: GameScript[];
  /** Biggest deficit overcome in a win (0 if none). */
  biggestComeback: number;
  /** Losses (any kind) after leading by 2 or more. */
  blownLeads: GameScript[];
  /** Points lost: losses after leading going into the 3rd. */
  lostLeadingAfter2: number;
  /** Wins after trailing going into the 3rd. */
  wonTrailingAfter2: number;
};

/** A one-goal game: final margin 1 (including shootouts), or 2 with an empty-net goal by the winner. */
export function isOneGoal(s: GameScript): boolean {
  const m = Math.abs(s.margin);
  if (m === 1) return true;
  return m === 2 && (s.margin > 0 ? s.enFor > 0 : s.enAgainst > 0);
}

export function summarise(scripts: GameScript[]): SituationSummary {
  const s: SituationSummary = {
    games: scripts.length,
    scoringFirst: emptyRecord(),
    allowingFirst: emptyRecord(),
    leadingAfter1: emptyRecord(),
    tiedAfter1: emptyRecord(),
    trailingAfter1: emptyRecord(),
    leadingAfter2: emptyRecord(),
    tiedAfter2: emptyRecord(),
    trailingAfter2: emptyRecord(),
    oneGoal: emptyRecord(),
    overtime: emptyRecord(),
    shootout: emptyRecord(),
    home: emptyRecord(),
    road: emptyRecord(),
    goalsFor: [0, 0, 0, 0],
    goalsAgainst: [0, 0, 0, 0],
    comebackWins: [],
    biggestComeback: 0,
    blownLeads: [],
    lostLeadingAfter2: 0,
    wonTrailingAfter2: 0,
  };
  for (const g of scripts) {
    if (g.scoredFirst === true) add(s.scoringFirst, g.outcome);
    if (g.scoredFirst === false) add(s.allowingFirst, g.outcome);
    add(g.after1 > 0 ? s.leadingAfter1 : g.after1 < 0 ? s.trailingAfter1 : s.tiedAfter1, g.outcome);
    add(g.after2 > 0 ? s.leadingAfter2 : g.after2 < 0 ? s.trailingAfter2 : s.tiedAfter2, g.outcome);
    if (isOneGoal(g)) add(s.oneGoal, g.outcome);
    if (g.decidedIn === "OT") add(s.overtime, g.outcome);
    if (g.decidedIn === "SO") add(s.shootout, g.outcome);
    add(g.isHome ? s.home : s.road, g.outcome);
    for (let i = 0; i < 4; i++) {
      s.goalsFor[i] += g.byPeriodFor[i];
      s.goalsAgainst[i] += g.byPeriodAgainst[i];
    }
    if (g.outcome === "W" && g.maxDeficit <= -2) s.comebackWins.push(g);
    if (g.outcome === "W") s.biggestComeback = Math.max(s.biggestComeback, -g.maxDeficit);
    if (g.outcome !== "W" && g.maxLead >= 2) s.blownLeads.push(g);
    if (g.outcome !== "W" && g.after2 > 0) s.lostLeadingAfter2++;
    if (g.outcome === "W" && g.after2 < 0) s.wonTrailingAfter2++;
  }
  return s;
}

// ------------------------------------------------------------------ from the database

/** Every regular-season game of a season that has its goals stored, with those goals. */
export function scriptGames(season: number, gameType = 2): ScriptGame[] {
  const db = getDb().$client;
  const games = db
    .prepare(
      `SELECT g.id gameId, g.game_date date, g.home_id homeId, g.away_id awayId, g.home_abbrev homeAbbrev, g.away_abbrev awayAbbrev,
         g.home_score homeScore, g.away_score awayScore, g.last_period_type lastPeriodType
       FROM stats_games g JOIN goal_status s ON s.game_id = g.id
       WHERE g.season = ? AND g.game_type = ? ORDER BY g.game_date, g.id`,
    )
    .all(season, gameType) as Omit<ScriptGame, "goals">[];
  const goals = db
    .prepare(
      `SELECT game_id gameId, team_id teamId, period, period_type periodType, period_seconds periodSeconds, event_id eventId, opp_goalie_in oppGoalieIn
       FROM goals WHERE season = ? AND game_type = ?`,
    )
    .all(season, gameType) as (Omit<ScriptGoal, "emptyNet"> & { gameId: number; oppGoalieIn: number })[];
  const byGame = new Map<number, ScriptGoal[]>();
  for (const { gameId, oppGoalieIn, ...x } of goals) {
    const list = byGame.get(gameId) ?? [];
    list.push({ ...x, emptyNet: !oppGoalieIn });
    byGame.set(gameId, list);
  }
  return games.map((g) => ({ ...g, goals: byGame.get(g.gameId) ?? [] }));
}

export type TeamSituations = { teamId: number; scripts: GameScript[]; summary: SituationSummary };

const cache = new Map<number, { at: number; value: Map<number, TeamSituations> }>();

/** Every team's game scripts and summary for a season (shared for a few minutes across pages). */
export function leagueSituations(season: number): Map<number, TeamSituations> {
  const hit = cache.get(season);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const byTeam = new Map<number, GameScript[]>();
  for (const g of scriptGames(season)) {
    for (const t of [g.homeId, g.awayId]) {
      const list = byTeam.get(t) ?? [];
      list.push(gameScript(g, t));
      byTeam.set(t, list);
    }
  }
  const value = new Map([...byTeam].map(([teamId, scripts]) => [teamId, { teamId, scripts, summary: summarise(scripts) }]));
  cache.set(season, { at: Date.now(), value });
  return value;
}

/** League rank (1 = best) of a team's points % in one situation, among teams with games in it. */
export function situationRank(all: Map<number, TeamSituations>, teamId: number, pick: (s: SituationSummary) => Record3): { rank: number | null; of: number } {
  const values = [...all.values()].map((t) => pointsPct(pick(t.summary))).filter((v): v is number => v !== null);
  const own = all.get(teamId);
  const v = own ? pointsPct(pick(own.summary)) : null;
  return { rank: v === null ? null : rankOf(v, values, true), of: values.length };
}
