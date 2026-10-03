/**
 * Head-to-head: this season's regular-season meetings between a team and tonight's opponent,
 * from the team's own schedule. "Season series 1-0-1 · 2 meetings left", or "First of 4
 * meetings" before they've played.
 */
import type { ScheduleGame } from "@/lib/nhl";
import { teamView, type Outcome } from "@/lib/oilers";

export type Meeting = { gameId: number; date: string; isHome: boolean; gf: number; ga: number; outcome: Outcome; decidedIn: string };

export type SeasonSeries = {
  opponent: string;
  /** Wins, regulation losses, OT/shootout losses, from the team's side. */
  record: { w: number; l: number; otl: number };
  played: Meeting[];
  /** Regular-season meetings this season, including tonight's. */
  total: number;
  /** Which meeting tonight's game is (1 = the first). */
  tonight: number;
  /** Meetings still to come after tonight. */
  leftAfter: number;
};

export function seasonSeries(games: ScheduleGame[], team: string, opponent: string, tonightId: number): SeasonSeries {
  const meetings = games
    .filter((g) => g.gameType === 2 && [g.homeTeam.abbrev, g.awayTeam.abbrev].includes(team) && [g.homeTeam.abbrev, g.awayTeam.abbrev].includes(opponent))
    .sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC));
  const played: Meeting[] = [];
  for (const g of meetings) {
    if (g.id === tonightId) continue;
    const v = teamView(g, team);
    if (!v.outcome) continue;
    played.push({ gameId: g.id, date: g.gameDate ?? g.startTimeUTC.slice(0, 10), isHome: v.isHome, gf: v.us.score!, ga: v.opp.score!, outcome: v.outcome, decidedIn: v.decidedIn ?? "REG" });
  }
  const index = meetings.findIndex((g) => g.id === tonightId);
  const record = {
    w: played.filter((m) => m.outcome === "W").length,
    l: played.filter((m) => m.outcome === "L").length,
    otl: played.filter((m) => m.outcome === "OTL" || m.outcome === "SOL").length,
  };
  return {
    opponent,
    record,
    played,
    total: meetings.length,
    tonight: index + 1,
    leftAfter: index >= 0 ? meetings.length - index - 1 : meetings.length - played.length,
  };
}

const ORDINAL_WORDS = ["", "First", "Second", "Third", "Fourth", "Fifth"];

/** "Season series 1-0-1 · 2 meetings left" or "First of 4 meetings". */
export function seriesLine(s: SeasonSeries): string {
  if (!s.played.length) {
    const nth = ORDINAL_WORDS[s.tonight] ?? `Meeting ${s.tonight}`;
    return s.total > 1 ? `${nth} of ${s.total} meetings` : "Only meeting this season";
  }
  const left = s.leftAfter === 0 ? "last meeting" : `${s.leftAfter} ${s.leftAfter === 1 ? "meeting" : "meetings"} left`;
  return `Season series ${s.record.w}-${s.record.l}-${s.record.otl} · ${left}`;
}
