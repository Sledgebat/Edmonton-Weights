/**
 * The site's colour rules: one place that decides when a number is green (good), red (bad) or
 * plain. Every page uses these, so a rank, a streak or a +/- reads the same everywhere. On
 * another team's page, green means good for that team.
 *
 *   League rank          top half green, bottom half red, exactly the middle plain
 *   Streak               W green; L or OT red
 *   Playoff odds         above 50% green, below red, 50% plain
 *   Rating out of 10     above 5.0 green, below red, 5.0 plain
 *   Plus/minus values    above 0 green, below red, 0 plain (judged on the number shown)
 *   Trend arrows         better green, worse red, flat plain
 *
 * Two deliberate exceptions live with their components: the luck meter stays neutral, and the
 * calendar uses result colours.
 */

export type Tone = "text-win" | "text-loss" | "";

/** Green in the top half of the league, red in the bottom half, plain exactly in the middle. */
export function rankTone(rank: number | null, of: number): Tone {
  if (rank === null || !of) return "";
  const middle = (of + 1) / 2;
  return rank < middle ? "text-win" : rank > middle ? "text-loss" : "";
}

/** Winning streak green; a losing run (regulation or overtime) red. */
export function streakTone(code: string | null | undefined): Tone {
  return code === "W" ? "text-win" : code === "L" || code === "OT" ? "text-loss" : "";
}

/** Green above 50%, red below, plain at exactly even (judged on the whole percent shown). */
export function oddsTone(odds: number): Tone {
  const p = Math.round(odds * 100);
  return p > 50 ? "text-win" : p < 50 ? "text-loss" : "";
}

/** Ratings out of 10: above 5.0 green, below red, 5.0 plain (judged on the one decimal shown). */
export function ratingTone(rating: number | null): Tone {
  if (rating === null) return "";
  return signedTone(rating - 5, 1);
}

/**
 * Plus/minus style values (goal differential, GSAx, G−ixG, rel xGF%...): above zero green, below
 * red, and plain when the number as shown (`digits` decimals) is zero.
 */
export function signedTone(v: number | null | undefined, digits = 0): Tone {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  const shown = Number(v.toFixed(digits));
  return shown > 0 ? "text-win" : shown < 0 ? "text-loss" : "";
}

/** Trend arrows: better green, worse red, flat plain. */
export function trendTone(trend: "better" | "worse" | "flat" | null): Tone {
  return trend === "better" ? "text-win" : trend === "worse" ? "text-loss" : "";
}

/** The matching border colour, for outlined pills and badges. */
export function borderOf(tone: Tone): string {
  return tone === "text-win" ? "border-win" : tone === "text-loss" ? "border-loss" : "border-line-strong";
}

/** The matching fill colour, for bars. */
export function fillOf(tone: Tone): string {
  return tone === "text-win" ? "bg-win" : tone === "text-loss" ? "bg-loss" : "bg-line-strong";
}

// ------------------------------------------------------------------ early-season ranks

/**
 * League ranks only mean something once every team has played: before that, "1st / 2" is a rank
 * out of the teams that happen to have games stored. `teamsWithGames` is how many teams the
 * ranking table has; `leagueTeams` how many are in the league (the standings).
 */
export function ranksReady(teamsWithGames: number, leagueTeams: number): boolean {
  return leagueTeams > 0 && teamsWithGames >= leagueTeams;
}

/** Shown instead of ranks until every team has played. */
export const RANKS_PENDING_NOTE = "League ranks appear once every team has played a game.";
