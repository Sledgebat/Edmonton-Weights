import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, setDbForTests } from "@/db";
import { Boxscore, PlayByPlay } from "@/lib/nhl/schemas";
import { extractShots, inInnerSlot, situation, strengthTime } from "@/lib/stats/extract";
import { ingestGame, ingestedIds, statsCounts } from "@/lib/stats/ingest";
import { auc, calibration, fitLogistic, logLoss, train, type TrainingShot } from "@/lib/stats/train";
import { currentModel, predict, scoreShots, sigmoid } from "@/lib/stats/xg";

const load = (p: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../../fixtures/v1", p), "utf8"));
// Oilers 5, Canucks 6 (OT), 2026-09-29.
const pbp = PlayByPlay.parse(load("gamecenter/2026020004/play-by-play.json"));
const box = Boxscore.parse(load("gamecenter/2026020004/boxscore.json"));
const EDM = 22;
const VAN = 23;

describe("situation codes", () => {
  it("reads strength from each side", () => {
    expect(situation("1551", true).strength).toBe("5v5");
    expect(situation("1451", true).strength).toBe("PP"); // away down a skater
    expect(situation("1451", false).strength).toBe("SH");
    expect(situation("1331", true).strength).toBe("EV"); // 3-on-3 overtime
    expect(situation("1460", false)).toMatchObject({ strength: "EN", oppGoalieIn: false }); // home goalie pulled
    expect(situation("1460", true)).toMatchObject({ strength: "EN", ownGoalieIn: false });
  });
});

describe("shot extraction", () => {
  const shots = extractShots(pbp);
  const of = (team: number) => shots.filter((s) => s.teamId === team);

  it("counts every attempt and matches the official shots on goal", () => {
    const sogPlusGoals = (team: number) => of(team).filter((s) => s.type === "shot-on-goal" || s.type === "goal").length;
    expect(sogPlusGoals(EDM)).toBe(pbp.homeTeam.sog);
    expect(sogPlusGoals(VAN)).toBe(pbp.awayTeam.sog);
    expect(of(EDM).filter((s) => s.isGoal)).toHaveLength(5);
    expect(of(VAN).filter((s) => s.isGoal)).toHaveLength(6);
  });

  it("normalises every unblocked shot to the attacking end", () => {
    const unblocked = shots.filter((s) => s.type !== "blocked-shot" && s.x !== null);
    const inOffensiveHalf = unblocked.filter((s) => s.x! > 0).length;
    expect(inOffensiveHalf / unblocked.length).toBeGreaterThan(0.97);
    for (const s of unblocked) {
      expect(s.distance!).toBeGreaterThanOrEqual(0);
      expect(s.angle!).toBeGreaterThanOrEqual(0);
      expect(s.angle!).toBeLessThanOrEqual(90);
    }
  });

  it("flags high-danger chances only for unblocked slot attempts", () => {
    for (const s of shots.filter((x) => x.highDanger)) {
      expect(s.type).not.toBe("blocked-shot");
      expect(s.x! >= 54 && Math.abs(s.y!) <= 22).toBe(true);
    }
    expect(inInnerSlot(80, 0)).toBe(true);
    expect(inInnerSlot(60, 0)).toBe(false);
    expect(shots.filter((s) => s.highDanger).length).toBeGreaterThan(5);
  });

  it("rebounds follow the same team's shot on goal within 3 seconds", () => {
    const rebounds = shots.filter((s) => s.rebound);
    for (const r of rebounds) {
      const prior = shots.filter((s) => s.teamId === r.teamId && s.type === "shot-on-goal" && s.gameSeconds < r.gameSeconds && r.gameSeconds - s.gameSeconds <= 3);
      expect(prior.length).toBeGreaterThan(0);
    }
  });

  it("splits the game's time by strength, adding up to the game length", () => {
    const t = strengthTime(pbp).get(EDM)!;
    const total = Object.values(t).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(3600); // 60 minutes plus 1:59 of overtime
    expect(total).toBeLessThanOrEqual(3600 + 119);
    expect(t.PP).toBe(strengthTime(pbp).get(VAN)!.SH);
  });

  it("assigns blocked shots zero xG and sensible values to the rest", () => {
    scoreShots(shots);
    expect(shots.filter((s) => s.type === "blocked-shot").every((s) => s.xg === 0)).toBe(true);
    const unblocked = shots.filter((s) => s.type !== "blocked-shot");
    expect(unblocked.every((s) => s.xg > 0 && s.xg < 1)).toBe(true);
    const total = shots.reduce((a, s) => a + s.xg, 0);
    expect(total).toBeGreaterThan(3);
    expect(total).toBeLessThan(12);
  });

  it("the box score's shooters are the extracted shooters", () => {
    const official = [...box.playerByGameStats!.homeTeam.forwards, ...box.playerByGameStats!.homeTeam.defense];
    for (const p of official) {
      const mine = of(EDM).filter((s) => s.shooterId === p.playerId && (s.type === "shot-on-goal" || s.type === "goal")).length;
      expect(mine, `player ${p.playerId}`).toBe(p.sog);
    }
  });
});

describe("xG model maths", () => {
  it("closer, straighter shots are worth more", () => {
    const base = { type: "shot-on-goal" as const, shotType: "wrist", rebound: false, rush: false, strength: "5v5" as const, lastEvent: "other" as const, secondsSinceLast: 10 };
    const close = predict({ ...base, distance: 10, angle: 0 });
    const far = predict({ ...base, distance: 50, angle: 0 });
    const wide = predict({ ...base, distance: 10, angle: 60 });
    expect(close).toBeGreaterThan(far);
    expect(close).toBeGreaterThan(wide);
    expect(predict({ ...base, distance: 10, angle: 0, rebound: true })).toBeGreaterThan(close);
  });

  it("logistic regression recovers known coefficients from simulated shots", () => {
    // Simulate shots from a known model, then check the fit finds it again.
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const a = rand() * 4;
      const b = rand() < 0.3 ? 1 : 0;
      X.push([a, b]);
      y.push(rand() < sigmoid(-1 - 0.8 * a + 1.2 * b) ? 1 : 0);
    }
    const fit = fitLogistic(X, y, 0.01);
    expect(fit.intercept).toBeCloseTo(-1, 0);
    expect(fit.coefficients[0]).toBeCloseTo(-0.8, 1);
    expect(fit.coefficients[1]).toBeCloseTo(1.2, 1);
  });

  it("metrics behave: perfect ranking has AUC 1, a constant model has the baseline log loss", () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
    expect(auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0);
    expect(logLoss([0.5, 0.5], [0, 1])).toBeCloseTo(Math.log(2), 6);
    const cal = calibration([0.1, 0.1, 0.9, 0.9], [0, 0, 1, 1], 2);
    expect(cal.map((c) => c.actual)).toEqual([0, 1]);
  });

  it("train() reports a held-out season when given two", () => {
    const shots = extractShots(pbp).filter((s) => s.type !== "blocked-shot");
    // Two copies of this game as two "seasons", just to exercise the pipeline.
    const asTraining = (season: number): TrainingShot[] =>
      shots.map((s) => ({ ...s, season, emptyNet: s.strength === "EN" && !s.oppGoalieIn }));
    const model = train([...asTraining(20242025), ...asTraining(20252026)], 5);
    expect(model.provisional).toBe(false);
    expect(model.coefficients).toHaveLength(currentModel().coefficients.length);
    expect((model.metrics.holdout as { testSeason: number }).testSeason).toBe(20252026);
  });
});

describe("ingest", () => {
  afterEach(() => setDbForTests(undefined));

  it("stores a game's shots and strength time, and re-ingesting replaces them", () => {
    setDbForTests(openDb(":memory:"));
    expect(ingestGame(pbp).shots).toBe(116);
    ingestGame(pbp);
    expect(ingestedIds().has(pbp.id)).toBe(true);
    expect(statsCounts()).toEqual({ games: [{ season: 20262027, n: 1 }], shots: 116 });
  });
});

describe("team and goalie tables", () => {
  afterEach(() => setDbForTests(undefined));

  it("builds both teams' metrics from one game, with complementary shares and ranks", async () => {
    setDbForTests(openDb(":memory:"));
    ingestGame(pbp);
    const { leagueTable, teamGames, goalieTable, shooterTable, rollingShare } = await import("@/lib/stats/team");
    const table = leagueTable(20262027);
    expect(table.map((t) => t.abbrev).sort()).toEqual(["EDM", "VAN"]);
    const edm = table.find((t) => t.abbrev === "EDM")!;
    const van = table.find((t) => t.abbrev === "VAN")!;
    expect(edm.metrics.cfPct + van.metrics.cfPct).toBeCloseTo(100, 6);
    expect(edm.metrics.xgfPct + van.metrics.xgfPct).toBeCloseTo(100, 6);
    expect(edm.cf).toBe(van.ca);
    expect(edm.toi5).toBe(van.toi5);
    // EDM outshot VAN 37-23, so they lead shot share and rank 1st.
    expect(edm.metrics.cfPct).toBeGreaterThan(50);
    expect(edm.ranks.cfPct).toBe(1);
    expect(van.ranks.cfPct).toBe(2);
    // Lower-is-better metrics rank the other way.
    expect(edm.ranks.ca60).toBe(edm.metrics.ca60 < van.metrics.ca60 ? 1 : 2);

    const games = teamGames(22, 20262027);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ opponent: "VAN", isHome: true, gf: 5, ga: 6, lastPeriodType: "OT" });
    expect(rollingShare(games, "xgf", "xga")[0].value).toBeGreaterThan(0);

    const goalies = goalieTable(20262027);
    const edmGoalies = goalies.filter((g) => g.teamId === 22);
    expect(edmGoalies.reduce((s, g) => s + g.goalsAllowed, 0)).toBe(6);
    expect(edmGoalies.reduce((s, g) => s + g.shotsFaced, 0)).toBe(23);

    const shooters = shooterTable(22, 20262027);
    expect(shooters.reduce((s, p) => s + p.goals, 0)).toBe(5);
  });
});
