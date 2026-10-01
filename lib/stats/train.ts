/**
 * Fits the xG model: L2-regularised logistic regression by Newton's method (IRLS), plus a small
 * distance-only model for empty-net shots. Evaluated on a held-out season before the final fit.
 */
import { features, FEATURES, sigmoid, type ModelShot, type XgModel } from "./xg";

export type TrainingShot = ModelShot & { isGoal: boolean; season: number; emptyNet: boolean };

/** Solve A x = b for a symmetric positive-definite A (Cholesky). */
function solveSPD(A: number[][], b: number[]): number[] {
  const n = b.length;
  const L = A.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(sum, 1e-12)) : sum / L[j][j];
    }
  }
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= L[i][k] * y[k];
    y[i] = sum / L[i][i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k];
    x[i] = sum / L[i][i];
  }
  return x;
}

/** Logistic regression with an intercept (not penalised) and ridge penalty `lambda` on the rest. */
export function fitLogistic(X: number[][], y: number[], lambda = 1, iterations = 25): { intercept: number; coefficients: number[] } {
  const d = X[0].length + 1;
  let w = new Array(d).fill(0);
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  w[0] = Math.log(mean / (1 - mean));
  for (let it = 0; it < iterations; it++) {
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    const g = new Array(d).fill(0);
    for (let n = 0; n < X.length; n++) {
      const row = X[n];
      let z = w[0];
      for (let j = 1; j < d; j++) z += w[j] * row[j - 1];
      const p = sigmoid(z);
      const r = p - y[n];
      const s = Math.max(p * (1 - p), 1e-9);
      g[0] += r;
      H[0][0] += s;
      for (let j = 1; j < d; j++) {
        const xj = row[j - 1];
        if (xj === 0) continue;
        g[j] += r * xj;
        H[0][j] += s * xj;
        for (let k = j; k < d; k++) {
          const xk = row[k - 1];
          if (xk !== 0) H[j][k] += s * xj * xk;
        }
      }
    }
    for (let j = 1; j < d; j++) {
      g[j] += lambda * w[j];
      H[j][j] += lambda;
    }
    for (let j = 0; j < d; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    const step = solveSPD(H, g);
    let maxStep = 0;
    w = w.map((v, j) => {
      maxStep = Math.max(maxStep, Math.abs(step[j]));
      return v - step[j];
    });
    if (maxStep < 1e-6) break;
  }
  return { intercept: w[0], coefficients: w.slice(1) };
}

export function logLoss(p: number[], y: number[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = Math.min(Math.max(p[i], 1e-9), 1 - 1e-9);
    s += y[i] ? -Math.log(q) : -Math.log(1 - q);
  }
  return s / p.length;
}

/** Area under the ROC curve (Mann-Whitney). */
export function auc(p: number[], y: number[]) {
  const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
  let sumPos = 0;
  let pos = 0;
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j < idx.length && p[idx[j]] === p[idx[i]]) j++;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (y[idx[k]]) {
      sumPos += avg;
      pos++;
    }
    i = j;
  }
  const neg = idx.length - pos;
  return pos && neg ? (sumPos - (pos * (pos + 1)) / 2) / (pos * neg) : 0.5;
}

/** Predicted vs actual goal rate in ten equal-size bins of predicted xG. */
export function calibration(p: number[], y: number[], bins = 10) {
  const idx = p.map((_, i) => i).sort((a, b) => p[a] - p[b]);
  const out: { predicted: number; actual: number; shots: number }[] = [];
  for (let b = 0; b < bins; b++) {
    const slice = idx.slice(Math.floor((b * idx.length) / bins), Math.floor(((b + 1) * idx.length) / bins));
    if (!slice.length) continue;
    out.push({
      predicted: slice.reduce((s, i) => s + p[i], 0) / slice.length,
      actual: slice.reduce((s, i) => s + y[i], 0) / slice.length,
      shots: slice.length,
    });
  }
  return out;
}

function fitAll(shots: TrainingShot[], lambda: number) {
  const located = shots.filter((s) => !s.emptyNet && s.distance !== null && s.angle !== null);
  const main = fitLogistic(
    located.map((s) => features(s)),
    located.map((s) => (s.isGoal ? 1 : 0)),
    lambda,
  );
  const en = shots.filter((s) => s.emptyNet && s.distance !== null);
  const enFit =
    en.length >= 50
      ? fitLogistic(en.map((s) => [(s.distance ?? 60) / 10]), en.map((s) => (s.isGoal ? 1 : 0)), 1)
      : { intercept: 1.5, coefficients: [-0.25] };
  const unblocked = shots.filter((s) => !s.emptyNet);
  const baseRate = unblocked.filter((s) => s.isGoal).length / Math.max(1, unblocked.length);
  return { main, en: { intercept: enFit.intercept, distance: enFit.coefficients[0] }, baseRate, located };
}

function toModel(fit: ReturnType<typeof fitAll>, trainedOn: string, metrics: Record<string, unknown>): XgModel {
  return {
    version: `trained-${new Date().toISOString().slice(0, 10)}`,
    provisional: false,
    trainedAt: new Date().toISOString(),
    trainedOn,
    features: [...FEATURES],
    intercept: fit.main.intercept,
    coefficients: fit.main.coefficients,
    emptyNet: fit.en,
    baseRate: fit.baseRate,
    metrics,
  };
}

/**
 * Evaluate on the latest season (trained on the others), then fit the final model on all seasons.
 * `shots` must be unblocked attempts only.
 */
export function train(shots: TrainingShot[], lambda = 1) {
  const seasons = [...new Set(shots.map((s) => s.season))].sort();
  if (seasons.length === 0) throw new Error("No shots to train on. Run `npm run stats:backfill` first.");

  let holdout: Record<string, unknown> | null = null;
  if (seasons.length >= 2) {
    const testSeason = seasons.at(-1)!;
    const fit = fitAll(shots.filter((s) => s.season !== testSeason), lambda);
    const m = toModel(fit, "", {});
    const test = shots.filter((s) => s.season === testSeason && !s.emptyNet && s.distance !== null && s.angle !== null);
    const p = test.map((s) => {
      let z = m.intercept;
      const x = features(s);
      for (let i = 0; i < x.length; i++) z += m.coefficients[i] * x[i];
      return sigmoid(z);
    });
    const y: number[] = test.map((s) => (s.isGoal ? 1 : 0));
    const rate = y.reduce((a, b) => a + b, 0) / y.length;
    holdout = {
      testSeason,
      shots: test.length,
      goals: y.reduce((a, b) => a + b, 0),
      expectedGoals: Math.round(p.reduce((a, b) => a + b, 0) * 10) / 10,
      logLoss: logLoss(p, y),
      baselineLogLoss: logLoss(p.map(() => rate), y),
      auc: auc(p, y),
      calibration: calibration(p, y),
    };
  }

  const finalFit = fitAll(shots, lambda);
  const metrics = {
    trainingShots: finalFit.located.length,
    trainingGoals: finalFit.located.filter((s) => s.isGoal).length,
    seasons,
    holdout,
  };
  return toModel(finalFit, `Unblocked shot attempts from ${seasons.join(", ")} (regular season and playoffs)`, metrics);
}
