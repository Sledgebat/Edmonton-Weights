/**
 * Expected goals (xG): the probability that an unblocked shot attempt becomes a goal, from where
 * and how it was taken. A logistic regression over the features below, trained by
 * `npm run xg:train` on past seasons of NHL play-by-play and saved to lib/stats/xg-model.json.
 *
 * Blocked shots are worth 0 xG (their recorded location is where they were blocked). Shots at an
 * empty net use a separate distance-only model. Shots with no recorded location get the
 * league-average rate.
 */
import modelJson from "./xg-model.json";
import type { ShotAttempt } from "./extract";

export const SHOT_TYPES = ["snap", "slap", "backhand", "tip-in", "deflected", "wrap-around", "other"] as const; // wrist = baseline
const KNOWN_TYPES = new Set(["wrist", ...SHOT_TYPES]);

/** Feature names, in the order of the model's coefficients. */
export const FEATURES = [
  "distance",
  "logDistance",
  "angle",
  "angleSq",
  "distanceXAngle",
  ...SHOT_TYPES.map((t) => `type:${t}`),
  "rebound",
  "rush",
  "strength:PP",
  "strength:SH",
  "strength:EV",
  "last:faceoff",
  "last:shot",
  "last:takeaway",
  "last:giveaway",
  "last:hit",
  "secondsSinceLast",
] as const;

export type ModelShot = Pick<
  ShotAttempt,
  "type" | "distance" | "angle" | "shotType" | "rebound" | "rush" | "strength" | "lastEvent" | "secondsSinceLast"
>;

export function features(s: ModelShot): number[] {
  const d = Math.max(1, s.distance ?? 30);
  const a = s.angle ?? 0;
  const st = s.shotType && KNOWN_TYPES.has(s.shotType) ? s.shotType : s.shotType ? "other" : "wrist";
  return [
    d / 10,
    Math.log(d),
    a / 10,
    (a / 10) ** 2,
    (d / 10) * (a / 10),
    ...SHOT_TYPES.map((t) => (st === t ? 1 : 0)),
    s.rebound ? 1 : 0,
    s.rush ? 1 : 0,
    s.strength === "PP" ? 1 : 0,
    s.strength === "SH" ? 1 : 0,
    s.strength === "EV" ? 1 : 0,
    s.lastEvent === "faceoff" ? 1 : 0,
    s.lastEvent === "shot" ? 1 : 0,
    s.lastEvent === "takeaway" ? 1 : 0,
    s.lastEvent === "giveaway" ? 1 : 0,
    s.lastEvent === "hit" ? 1 : 0,
    Math.min(s.secondsSinceLast, 30) / 30,
  ];
}

export type XgModel = {
  version: string;
  provisional: boolean;
  trainedAt: string | null;
  trainedOn: string;
  features: string[];
  intercept: number;
  coefficients: number[];
  /** Empty-net shots: logit = a + b * distance/10. */
  emptyNet: { intercept: number; distance: number };
  /** Goals / unblocked attempts, used when a shot has no location. */
  baseRate: number;
  metrics: Record<string, unknown>;
};

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

let model = modelJson as XgModel;

export function currentModel(): XgModel {
  return model;
}
/** Tests and the trainer swap models in. */
export function setModel(m: XgModel) {
  model = m;
}

export function predict(s: ModelShot & { oppGoalieIn?: boolean }, m: XgModel = model): number {
  if (s.type === "blocked-shot") return 0;
  if (s.strength === "EN" && s.oppGoalieIn === false) {
    return sigmoid(m.emptyNet.intercept + m.emptyNet.distance * ((s.distance ?? 60) / 10));
  }
  if (s.distance === null || s.angle === null) return m.baseRate;
  const x = features(s);
  let z = m.intercept;
  for (let i = 0; i < x.length; i++) z += m.coefficients[i] * x[i];
  return sigmoid(z);
}

/** Score a list of shots in place and return it. */
export function scoreShots<T extends ModelShot & { oppGoalieIn?: boolean; xg: number }>(shots: T[], m: XgModel = model): T[] {
  for (const s of shots) s.xg = predict(s, m);
  return shots;
}
