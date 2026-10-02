/**
 * Playoff picture for one team, from the standings. An estimate: the NHL's full tiebreakers
 * (regulation wins, then more) aren't modelled, so a tie on points is treated as not yet clinched.
 *
 * In the wildcard format, the top three in each division plus two wild cards per conference
 * make it. The "first team out" is the third wild card.
 *
 *   magic number  = points the team must gain, or the first team out must fail to gain, to
 *                   clinch: (their max possible points) − (our points) + 1. At 0 or below: clinched.
 *   tragic number = the same idea in reverse, against the last team in (second wild card).
 */
import type { StandingsRow } from "./nhl/schemas";
import { teamOf, wildCardTable } from "./oilers";

/** Regular-season length when the schedule can't tell us (84 games from 2026-27; 82 before). */
export const SEASON_GAMES = 84;
/** Show the magic number from the midpoint of the season. */
export const magicFromGp = (seasonGames: number) => Math.ceil(seasonGames / 2);

export type PlayoffPicture = {
  team: string;
  points: number;
  gamesPlayed: number;
  /** Games in the regular season. */
  seasonGames: number;
  /** Points pace over the full season. */
  pace: number;
  inPlayoffSpot: boolean;
  /** How the spot is held: "Division 2nd", "Wild card 1", or null when out. */
  spot: string | null;
  /** The last team in (if we're out) or the first team out (if we're in). */
  rival: { team: string; points: number; gamesPlayed: number } | null;
  /** Points above (+) or below (−) the playoff line. */
  cushion: number;
  /** Shown only from mid-season. */
  magicNumber: number | null;
  clinched: boolean;
  /** Mid-season onward, when out: points the rival must fail to gain, or we must gain, before elimination. */
  tragicNumber: number | null;
  eliminated: boolean;
  showNumbers: boolean;
};

/** `seasonGames` comes from the schedule (count the team's regular-season games). */
export function playoffPicture(rows: StandingsRow[], team = "EDM", seasonGames = SEASON_GAMES): PlayoffPicture | null {
  const maxPoints = (r: Pick<StandingsRow, "points" | "gamesPlayed">) => r.points + 2 * Math.max(0, seasonGames - r.gamesPlayed);
  const me = rows.find((r) => teamOf(r) === team);
  if (!me) return null;
  const wc = wildCardTable(rows, me.conferenceAbbrev);

  const leaderIdx = wc.leaders.findIndex((l) => l.rows.some((r) => teamOf(r) === team));
  const wcIdx = wc.wildCard.findIndex((r) => teamOf(r) === team);
  const inPlayoffSpot = leaderIdx >= 0 || (wcIdx >= 0 && wcIdx < wc.cutAfter);
  const spot =
    leaderIdx >= 0
      ? `${["1st", "2nd", "3rd"][wc.leaders[leaderIdx].rows.findIndex((r) => teamOf(r) === team)]} in the ${wc.leaders[leaderIdx].name}`
      : wcIdx >= 0 && wcIdx < wc.cutAfter
        ? `Wild card ${wcIdx + 1}`
        : null;

  const firstOut = wc.wildCard[wc.cutAfter];
  const lastIn = wc.wildCard[wc.cutAfter - 1];
  const rivalRow = inPlayoffSpot ? firstOut : lastIn;
  const rival = rivalRow ? { team: teamOf(rivalRow), points: rivalRow.points, gamesPlayed: rivalRow.gamesPlayed } : null;
  const cushion = rival ? me.points - rival.points : 0;

  const showNumbers = me.gamesPlayed >= magicFromGp(seasonGames);
  const magicNumber = inPlayoffSpot && firstOut ? Math.max(0, maxPoints(firstOut) - me.points + 1) : null;
  const tragicNumber = !inPlayoffSpot && lastIn ? Math.max(0, maxPoints(me) - lastIn.points + 1) : null;

  return {
    team,
    seasonGames,
    points: me.points,
    gamesPlayed: me.gamesPlayed,
    pace: me.gamesPlayed ? Math.round((me.points / me.gamesPlayed) * seasonGames) : 0,
    inPlayoffSpot,
    spot,
    rival,
    cushion,
    magicNumber: showNumbers ? magicNumber : null,
    clinched: magicNumber === 0,
    tragicNumber: showNumbers ? tragicNumber : null,
    // We can't catch the last team in even by winning out.
    eliminated: !inPlayoffSpot && !!lastIn && maxPoints(me) < lastIn.points,
    showNumbers,
  };
}
