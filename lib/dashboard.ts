/**
 * The home page's dashboard extras: what's at stake tonight, the season series with tonight's
 * opponent, last-game badges, the small luck gauge, the personality tag, hot and cold streaks and
 * milestone watch. Each appears only when it applies.
 */
import { gameBadges, storedLastName, type Badge } from "@/lib/badges";
import { seasonSeries, seriesLine, type Meeting } from "@/lib/h2h";
import { SMALL_SAMPLE_GAMES, gamesCount, type LeagueContext } from "@/lib/home";
import { inDepthLeague } from "@/lib/indepth";
import { load } from "@/lib/load";
import { milestoneText, nextMilestones, playerTotals, withinReach, type Milestone } from "@/lib/milestones";
import { nhl, txt, type ClubStats, type ScheduleGame } from "@/lib/nhl";
import { isLive } from "@/lib/nhl/endpoints";
import { LUCK_CLIP } from "@/lib/stats/luck";
import { latestStakes, type Stakes } from "@/lib/stats/odds";
import { personality } from "@/lib/stats/personality";
import { teamGames } from "@/lib/stats/team";
import { currentRuns, streakBoard, type PlayerRuns, type StreakBoard } from "@/lib/streaks";

export type Dashboard = {
  stakes: Stakes | null;
  series: { line: string; meetings: (Meeting & { xgf: number | null; xga: number | null })[] } | null;
  lastBadges: Badge[];
  luck: { diff: number; actual: number; deserved: number; clip: number } | null;
  personality: { label: string } | null;
  streaks: StreakBoard;
  milestones: { id: number; name: string; text: string }[];
};

/** At most this many milestones on the home strip. */
export const HOME_MILESTONES = 3;

export async function dashboardData({
  season,
  team,
  teamId,
  teamName,
  teamWord,
  games,
  next,
  last,
  clubStats,
  lg,
}: {
  season: number;
  team: string;
  teamId: number;
  /** As the NHL spells it in season totals, e.g. "Edmonton Oilers". */
  teamName: string;
  /** "an Oiler". */
  teamWord: string;
  games: ScheduleGame[];
  next: ScheduleGame | null;
  last: ScheduleGame | null;
  clubStats: ClubStats | undefined;
  lg: LeagueContext;
}): Promise<Dashboard> {
  // What's at stake and the season series, for an unplayed regular-season game.
  const upcoming = next && next.gameType === 2 && !isLive(next.gameState) ? next : null;
  const stakes = upcoming ? latestStakes(season, team, upcoming.id) : null;
  let series: Dashboard["series"] = null;
  if (next && next.gameType === 2) {
    const opp = next.homeTeam.abbrev === team ? next.awayTeam.abbrev : next.homeTeam.abbrev;
    const s = seasonSeries(games, team, opp, next.id);
    const xg = new Map(teamGames(teamId, season).map((g) => [g.gameId, g]));
    series = { line: seriesLine(s), meetings: s.played.map((m) => ({ ...m, xgf: xg.get(m.gameId)?.xgf ?? null, xga: xg.get(m.gameId)?.xga ?? null })) };
  }

  const lastBadges = last ? gameBadges(last.id, teamId, season, storedLastName) : [];

  // Luck gauge and personality tag (the tag waits for a real sample, like the in-depth card).
  const deep = await inDepthLeague(season);
  const l = deep.luck.get(teamId);
  const luck = l && l.games.length ? { diff: l.diff, actual: l.actual, deserved: l.deserved, clip: LUCK_CLIP } : null;
  const traits = deep.traits.get(teamId);
  const enough = gamesCount(teamId, season) >= SMALL_SAMPLE_GAMES && lg.ranksReady;
  const persona = enough && traits ? { label: personality(traits, deep.of).primary.type.label } : null;

  // Streaks from game logs (the same logs the player pages use).
  const skaters = clubStats?.skaters.filter((p) => p.gamesPlayed > 0) ?? [];
  const runs: PlayerRuns[] = (
    await Promise.all(
      skaters.map(async (p) => {
        const log = await load(() => nhl.gameLog(p.playerId, season, 2));
        return log.ok ? { id: p.playerId, name: `${txt(p.firstName)} ${txt(p.lastName)}`, gp: p.gamesPlayed, runs: currentRuns(log.data.gameLog) } : null;
      }),
    )
  ).filter((x): x is PlayerRuns => x !== null);

  // Milestones within reach, career and with the team (a team milestone that's also the career
  // one, for a player who's only played here, is shown once).
  const people = [...(clubStats?.skaters ?? []), ...(clubStats?.goalies ?? [])];
  const found: { id: number; name: string; m: Milestone }[] = [];
  await Promise.all(
    people.map(async (p) => {
      const landing = await load(() => nhl.player(p.playerId));
      if (!landing.ok) return;
      const t = playerTotals(landing.data, teamName);
      const career = nextMilestones(t.career, "career");
      const ownTeam = nextMilestones(t.team, "team").filter((m) => t.career[m.stat] !== m.current);
      for (const m of withinReach([...career, ...ownTeam])) found.push({ id: p.playerId, name: `${txt(p.firstName)} ${txt(p.lastName)}`, m });
    }),
  );
  const milestones = found
    .sort((a, b) => b.m.closeness - a.m.closeness || a.m.toGo - b.m.toGo || a.name.localeCompare(b.name))
    // One per player, so a single star doesn't fill the strip.
    .filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)
    .slice(0, HOME_MILESTONES)
    .map((x) => ({ id: x.id, name: x.name, text: milestoneText(x.m, teamWord) }));

  return { stakes, series, lastBadges, luck, personality: persona, streaks: streakBoard(runs), milestones };
}

/** A player's closest milestone (within reach first, else the next points or wins milestone). */
export function nextMilestoneFor(landing: Parameters<typeof playerTotals>[0], teamName: string, teamWord: string): string | null {
  const t = playerTotals(landing, teamName);
  const career = nextMilestones(t.career, "career");
  const ownTeam = nextMilestones(t.team, "team").filter((m) => t.career[m.stat] !== m.current);
  const close = withinReach([...career, ...ownTeam])[0];
  if (close) return milestoneText(close, teamWord);
  const main = career.find((m) => m.stat === (t.goalie ? "wins" : "points"));
  return main ? milestoneText(main, teamWord) : null;
}
