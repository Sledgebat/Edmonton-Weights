/** Training entry point used by the scripts: read shots from SQLite, fit, save, rescore. Node only. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "@/db";
import type { LastEvent, Strength } from "./extract";
import { train, type TrainingShot } from "./train";
import { predict, setModel, type XgModel } from "./xg";

type Row = {
  game_id: number;
  x: number | null;
  event_id: number;
  season: number;
  type: string;
  shot_type: string | null;
  distance: number | null;
  angle: number | null;
  strength: string;
  rebound: number;
  rush: number;
  last_event: string;
  seconds_since_last: number;
  is_goal: number;
};

const MODEL_FILE = path.join(process.cwd(), "lib", "stats", "xg-model.json");
const REPORT_FILE = path.join(process.cwd(), "lib", "stats", "xg-report.md");

function toShot(r: Row) {
  return {
    type: r.type as TrainingShot["type"],
    shotType: r.shot_type,
    distance: r.distance,
    angle: r.angle,
    // "EN-own": the shooting team pulled its goalie (main model); "EN": shooting at an empty net.
    strength: (r.strength === "EN-own" ? "EN" : r.strength) as Strength,
    x: r.x,
    rebound: !!r.rebound,
    rush: !!r.rush,
    lastEvent: r.last_event as LastEvent,
    secondsSinceLast: r.seconds_since_last,
    isGoal: !!r.is_goal,
    season: r.season,
    emptyNet: r.strength === "EN",
  };
}

/**
 * Bring stored shots up to the current definitions (idempotent). Everything needed is in the
 * stored columns, so no re-download.
 */
export function applyDefinitionFixes(log: (m: string) => void = console.log) {
  const sqlite = getDb().$client;
  const rush = sqlite.prepare(`UPDATE shots SET rush = 0 WHERE rush = 1 AND (x IS NULL OR x < 25)`).run().changes;
  const hd = sqlite
    .prepare(
      `UPDATE shots SET high_danger = (type != 'blocked-shot' AND x IS NOT NULL AND y IS NOT NULL AND x <= 89 AND (
         (x >= 69 AND abs(y) <= 9) OR (rebound = 1 AND x >= 54 AND abs(y) <= 22)))`,
    )
    .run().changes;
  log(`Definitions applied (rush flags corrected: ${rush}, high-danger re-checked: ${hd}).`);
}

export function trainFromDatabase(opts: { seasons?: number[]; log?: (m: string) => void } = {}): XgModel {
  const log = opts.log ?? console.log;
  const sqlite = getDb().$client;
  applyDefinitionFixes(log);
  const where = opts.seasons?.length ? `AND season IN (${opts.seasons.map(Number).join(",")})` : "";
  const rows = sqlite
    .prepare(`SELECT * FROM shots WHERE type != 'blocked-shot' AND game_type IN (2, 3) ${where}`)
    .all() as Row[];
  log(`Training on ${rows.length.toLocaleString()} unblocked shot attempts...`);
  const model = train(rows.map(toShot));
  writeFileSync(MODEL_FILE, JSON.stringify(model, null, 2) + "\n");
  writeFileSync(REPORT_FILE, report(model));
  setModel(model);
  log(`Saved ${path.relative(process.cwd(), MODEL_FILE)} and ${path.relative(process.cwd(), REPORT_FILE)}`);
  return model;
}

/** Re-score every stored shot with the current model. */
export function rescoreAll(log: (m: string) => void = console.log) {
  const sqlite = getDb().$client;
  const rows = sqlite.prepare(`SELECT * FROM shots`).all() as Row[];
  const update = sqlite.prepare(`UPDATE shots SET xg = ? WHERE game_id = ? AND event_id = ?`);
  sqlite.transaction(() => {
    for (const r of rows) {
      const s = toShot(r);
      update.run(r.type === "blocked-shot" ? 0 : predict({ ...s, oppGoalieIn: !s.emptyNet }), r.game_id, r.event_id);
    }
  })();
  log(`Re-scored ${rows.length.toLocaleString()} shots.`);
}

function report(m: XgModel): string {
  const h = m.metrics.holdout as
    | { testSeason: number; shots: number; goals: number; expectedGoals: number; logLoss: number; baselineLogLoss: number; auc: number; calibration: { predicted: number; actual: number; shots: number }[] }
    | null;
  const lines = [
    `# xG model report`,
    ``,
    `Trained ${m.trainedAt} on ${m.trainedOn}.`,
    ``,
    `- Training shots: ${(m.metrics.trainingShots as number).toLocaleString()} (${(m.metrics.trainingGoals as number).toLocaleString()} goals)`,
    `- League goal rate on unblocked attempts: ${(m.baseRate * 100).toFixed(2)}%`,
    ``,
  ];
  if (h) {
    lines.push(
      `## Held-out test: ${h.testSeason}`,
      ``,
      `Model fitted on the other seasons, scored on ${h.testSeason} only.`,
      ``,
      `| Measure | Value | Meaning |`,
      `| --- | --- | --- |`,
      `| Log loss | ${h.logLoss.toFixed(4)} | Lower is better |`,
      `| Log loss, no model | ${h.baselineLogLoss.toFixed(4)} | Every shot given the league rate |`,
      `| Improvement | ${((1 - h.logLoss / h.baselineLogLoss) * 100).toFixed(1)}% | Public models typically land around 10–20% |`,
      `| AUC | ${h.auc.toFixed(3)} | 0.5 = coin flip; public models are usually 0.75–0.80 |`,
      `| Goals vs xG | ${h.goals} vs ${h.expectedGoals} | Should be close |`,
      ``,
      `### Calibration (ten equal groups of shots)`,
      ``,
      `| Predicted | Actual | Shots |`,
      `| --- | --- | --- |`,
      ...h.calibration.map((c) => `| ${(c.predicted * 100).toFixed(1)}% | ${(c.actual * 100).toFixed(1)}% | ${c.shots.toLocaleString()} |`),
      ``,
    );
  }
  lines.push(`## Coefficients`, ``, `| Feature | Coefficient |`, `| --- | --- |`, `| intercept | ${m.intercept.toFixed(3)} |`);
  m.features.forEach((f, i) => lines.push(`| ${f} | ${m.coefficients[i].toFixed(3)} |`));
  lines.push(``, `Empty net: logit = ${m.emptyNet.intercept.toFixed(3)} + ${m.emptyNet.distance.toFixed(3)} × distance/10`, ``);
  return lines.join("\n");
}
