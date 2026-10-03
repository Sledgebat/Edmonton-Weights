/**
 * Milestone watch: round-number career milestones (and milestones with one team) a player is
 * close to, from the NHL's career and season totals (regular season).
 *
 *   Skaters  games every 100, goals every 50, assists and points every 100
 *   Goalies  games every 100, wins every 50, shutouts every 10
 *
 * "Close" = within 10 games, 5 goals, 10 assists, 10 points, 5 wins or 2 shutouts.
 */
import type { PlayerLanding } from "@/lib/nhl";

export type MilestoneStat = "games" | "goals" | "assists" | "points" | "wins" | "shutouts";

export const STEP: Record<MilestoneStat, number> = { games: 100, goals: 50, assists: 100, points: 100, wins: 50, shutouts: 10 };
export const REACH: Record<MilestoneStat, number> = { games: 10, goals: 5, assists: 10, points: 10, wins: 5, shutouts: 2 };

const NOUN: Record<MilestoneStat, [string, string]> = {
  games: ["game", "games"],
  goals: ["goal", "goals"],
  assists: ["assist", "assists"],
  points: ["point", "points"],
  wins: ["win", "wins"],
  shutouts: ["shutout", "shutouts"],
};

export type Totals = Partial<Record<MilestoneStat, number>>;

export type Milestone = {
  stat: MilestoneStat;
  /** Career, or with the named team. */
  scope: "career" | "team";
  current: number;
  target: number;
  toGo: number;
  /** How close, 0 (just reached the last one) to 1 (one away), for sorting. */
  closeness: number;
};

/** The next round number for each stat, whether or not it's close. */
export function nextMilestones(totals: Totals, scope: Milestone["scope"]): Milestone[] {
  return (Object.keys(totals) as MilestoneStat[]).flatMap((stat) => {
    const current = totals[stat];
    if (current === undefined || current < 0) return [];
    const target = (Math.floor(current / STEP[stat]) + 1) * STEP[stat];
    const toGo = target - current;
    return [{ stat, scope, current, target, toGo, closeness: 1 - (toGo - 1) / REACH[stat] }];
  });
}

/** Only the milestones within reach, closest first. */
export const withinReach = (ms: Milestone[]) => ms.filter((m) => m.toGo <= REACH[m.stat]).sort((a, b) => b.closeness - a.closeness || a.toGo - b.toGo);

const fmt = (n: number) => n.toLocaleString("en-CA");

/** "3 points from 1,300" or "9 games from 900 as an Oiler". */
export function milestoneText(m: Milestone, teamWord = "an Oiler"): string {
  const [one, many] = NOUN[m.stat];
  return `${m.toGo} ${m.toGo === 1 ? one : many} from ${fmt(m.target)}${m.scope === "team" ? ` as ${teamWord}` : ""}`;
}

/** Career and with-the-team totals from a player's NHL landing (regular season, NHL only). */
export function playerTotals(p: PlayerLanding, teamName: string): { career: Totals; team: Totals; goalie: boolean } {
  const goalie = p.position === "G";
  const pick = (line?: { gamesPlayed?: number; goals?: number; assists?: number; points?: number; wins?: number; shutouts?: number }): Totals =>
    goalie
      ? { games: line?.gamesPlayed, wins: line?.wins, shutouts: line?.shutouts }
      : { games: line?.gamesPlayed, goals: line?.goals, assists: line?.assists, points: line?.points };
  const career = pick(p.careerTotals?.regularSeason);
  const rows = (p.seasonTotals ?? []).filter((s) => s.leagueAbbrev === "NHL" && s.gameTypeId === 2 && s.teamName?.default === teamName);
  const team: Totals = {};
  if (rows.length) {
    const keys = (goalie ? ["games", "wins", "shutouts"] : ["games", "goals", "assists", "points"]) as MilestoneStat[];
    for (const k of keys) team[k] = rows.reduce((s, r) => s + ((k === "games" ? r.gamesPlayed : r[k]) ?? 0), 0);
  }
  const clean = (t: Totals) => Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === "number")) as Totals;
  return { career: clean(career), team: clean(team), goalie };
}
