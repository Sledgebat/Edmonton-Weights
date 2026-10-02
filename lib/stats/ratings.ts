/**
 * Player ratings out of 10, soccer-app style, from Game Score.
 *
 * Each game's Game Score is placed in the distribution of every NHL skater game (goalies: goalie
 * game) from the two seasons before the one being rated, then mapped to a rating:
 *
 *   9.0–10  exceptional  top 1.5%        6.0–6.9  good        above average
 *   8.0–8.9  excellent    top 5%          5.0–5.9  average     the middle
 *   7.0–7.9  very good    top 18%         below 5  rough game  bottom 22%
 *
 * The cut-offs are calibrated once per season (`npm run ratings:calibrate`, saved in
 * rating-model.json), so a 7.5 means the same thing in October as in April.
 */
import model from "./rating-model.json";

/** Percentile of all games → rating. Ratings in between are interpolated in Game Score. */
export const RATING_ANCHORS: [percentile: number, rating: number][] = [
  [0, 3],
  [0.22, 5],
  [0.55, 6],
  [0.82, 7],
  [0.95, 8],
  [0.985, 9],
  [1, 10],
];

/** Game Score at each anchor percentile, lowest first. */
export type Cutoffs = number[];

export type RatingModel = {
  /** The season these cut-offs rate. */
  season: number;
  calibratedFrom: number[];
  calibratedAt: string;
  skater: { games: number; cutoffs: Cutoffs };
  goalie: { games: number; cutoffs: Cutoffs };
};

export const ratingModel = model as RatingModel;

/** The value at percentile p (0–1) of sorted values, linearly interpolated. */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = p * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Game Score cut-offs for the anchor percentiles, from a sample of games. */
export function calibrate(gameScores: number[]): Cutoffs {
  const sorted = [...gameScores].sort((a, b) => a - b);
  return RATING_ANCHORS.map(([p]) => quantile(sorted, p));
}

/** Rating out of 10 (one decimal) for a Game Score. */
export function rate(gameScore: number, cutoffs: Cutoffs): number {
  const n = RATING_ANCHORS.length;
  if (cutoffs.length !== n) return 0;
  let r: number;
  if (gameScore <= cutoffs[0]) r = RATING_ANCHORS[0][1];
  else if (gameScore >= cutoffs[n - 1]) r = RATING_ANCHORS[n - 1][1];
  else {
    let i = 0;
    while (i < n - 2 && gameScore > cutoffs[i + 1]) i++;
    const [lo, hi] = [cutoffs[i], cutoffs[i + 1]];
    const t = hi > lo ? (gameScore - lo) / (hi - lo) : 1;
    r = RATING_ANCHORS[i][1] + t * (RATING_ANCHORS[i + 1][1] - RATING_ANCHORS[i][1]);
  }
  return Math.round(r * 10) / 10;
}

export const ratingOf = (gameScore: number, pos: string, m: RatingModel = ratingModel) => rate(gameScore, pos === "G" ? m.goalie.cutoffs : m.skater.cutoffs);

export function ratingLabel(r: number): string {
  if (r >= 9) return "Exceptional";
  if (r >= 8) return "Excellent";
  if (r >= 7) return "Very good";
  if (r >= 6) return "Good";
  if (r >= 5) return "Average";
  return "Rough game";
}
