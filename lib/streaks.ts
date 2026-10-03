/**
 * Current streaks and droughts from players' game logs (newest game first): point streaks of 3+
 * games, goal streaks of 2+, and the longest active goalless and pointless runs among regulars.
 * Game logs are used rather than our shift data so a game whose shift charts aren't published
 * yet still counts.
 */

export type LogGame = { gameDate: string; goals?: number; assists?: number; points?: number };

export type Runs = {
  /** Consecutive most recent games with a point, and the goals and assists in them. */
  points: number;
  pointsGoals: number;
  pointsAssists: number;
  /** Consecutive most recent games with a goal, and the goals in them. */
  goals: number;
  goalsScored: number;
  /** Consecutive most recent games without a goal / without a point. */
  goalless: number;
  pointless: number;
};

export const POINT_STREAK_MIN = 3;
export const GOAL_STREAK_MIN = 2;
/** Droughts only count for regulars, and only once they're this long. */
export const REGULAR_GP = 10;
export const DROUGHT_MIN = 5;

/** Current runs for one player, from his game log (any order). */
export function currentRuns(log: LogGame[]): Runs {
  const games = [...log].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  const run = (test: (g: LogGame) => boolean) => {
    const i = games.findIndex((g) => !test(g));
    return i === -1 ? games.length : i;
  };
  const pts = (g: LogGame) => g.points ?? (g.goals ?? 0) + (g.assists ?? 0);
  const points = run((g) => pts(g) > 0);
  const goals = run((g) => (g.goals ?? 0) > 0);
  const sum = (n: number, k: "goals" | "assists") => games.slice(0, n).reduce((s, g) => s + (g[k] ?? 0), 0);
  return {
    points,
    pointsGoals: sum(points, "goals"),
    pointsAssists: sum(points, "assists"),
    goals,
    goalsScored: sum(goals, "goals"),
    goalless: run((g) => (g.goals ?? 0) === 0),
    pointless: run((g) => pts(g) === 0),
  };
}

export type PlayerRuns = { id: number; name: string; gp: number; runs: Runs };

export type StreakBoard = {
  pointStreaks: PlayerRuns[];
  goalStreaks: PlayerRuns[];
  goalless: PlayerRuns[];
  pointless: PlayerRuns[];
};

/** Who's on a streak and who's in a drought, longest first. */
export function streakBoard(players: PlayerRuns[], { droughts = 2 } = {}): StreakBoard {
  const regulars = players.filter((p) => p.gp >= REGULAR_GP);
  return {
    pointStreaks: players.filter((p) => p.runs.points >= POINT_STREAK_MIN).sort((a, b) => b.runs.points - a.runs.points || b.runs.pointsGoals + b.runs.pointsAssists - (a.runs.pointsGoals + a.runs.pointsAssists)),
    goalStreaks: players.filter((p) => p.runs.goals >= GOAL_STREAK_MIN).sort((a, b) => b.runs.goals - a.runs.goals || b.runs.goalsScored - a.runs.goalsScored),
    goalless: regulars.filter((p) => p.runs.goalless >= DROUGHT_MIN).sort((a, b) => b.runs.goalless - a.runs.goalless).slice(0, droughts),
    pointless: regulars.filter((p) => p.runs.pointless >= DROUGHT_MIN).sort((a, b) => b.runs.pointless - a.runs.pointless).slice(0, droughts),
  };
}
