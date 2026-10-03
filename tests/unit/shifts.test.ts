import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { endpoints, fixturePathFor } from "@/lib/nhl/endpoints";
import { PlayByPlay, ShiftCharts } from "@/lib/nhl/schemas";
import { extractShots } from "@/lib/stats/extract";
import { regularUnits, type Unit } from "@/lib/stats/onice";
import { RATING_ANCHORS, calibrate, rate } from "@/lib/stats/ratings";
import { onIceGame, physicalCounts, shiftIntervals, skaterGameScore } from "@/lib/stats/shifts";
import { scoreShots } from "@/lib/stats/xg";

const fixtures = path.resolve(__dirname, "../../fixtures");
const json = (rel: string) => JSON.parse(readFileSync(path.join(fixtures, rel), "utf8"));

const GAME = 2026020004; // VAN @ EDM, opening night
const pbp = PlayByPlay.parse(json(`v1/gamecenter/${GAME}/play-by-play.json`));
const shifts = ShiftCharts.parse(json(fixturePathFor(endpoints.shiftCharts(GAME)))).data;
const box = json(`v1/gamecenter/${GAME}/boxscore.json`);
const shots = scoreShots(extractShots(pbp));
const { players, units } = onIceGame(pbp, shifts, shots);

type BoxLine = { playerId: number; toi: string; sog?: number; blockedShots?: number; hits?: number; giveaways?: number; takeaways?: number };
const official = new Map<number, BoxLine>();
for (const side of ["homeTeam", "awayTeam"])
  for (const group of ["forwards", "defense", "goalies"]) for (const p of (box.playerByGameStats?.[side]?.[group] ?? []) as BoxLine[]) official.set(p.playerId, p);
const secs = (mmss: string) => mmss.split(":").map(Number).reduce((m, s) => m * 60 + s);

describe("shift charts", () => {
  it("reads shifts as seconds since the opening faceoff", () => {
    const iv = shiftIntervals([{ gameId: GAME, playerId: 1, teamId: 22, period: 2, startTime: "01:30", endTime: "02:15", typeCode: 517 }]);
    expect(iv).toEqual([{ playerId: 1, teamId: 22, start: 1290, end: 1335 }]);
    // Goal markers and rows without times are skipped.
    expect(shiftIntervals([{ gameId: GAME, playerId: 1, teamId: 22, period: 1, startTime: "01:00", endTime: "01:00", typeCode: 505 }])).toEqual([]);
  });

  it("ice time matches the NHL's box score for every player", () => {
    expect(players.length).toBeGreaterThan(36);
    for (const p of players) {
      const o = official.get(p.playerId);
      expect(o, `player ${p.playerId} in box score`).toBeDefined();
      expect(Math.abs(p.toi - secs(o!.toi))).toBeLessThanOrEqual(2);
    }
  });

  it("shots on goal and blocks match the box score", () => {
    for (const p of players.filter((x) => x.pos !== "G")) {
      const o = official.get(p.playerId)!;
      expect(p.sog).toBe(o.sog ?? 0);
      expect(p.blk).toBe(o.blockedShots ?? 0);
    }
  });

  it("hits, giveaways and takeaways match the box score", () => {
    const counts = physicalCounts(pbp);
    let total = 0;
    for (const p of players.filter((x) => x.pos !== "G")) {
      const o = official.get(p.playerId)!;
      expect(p.hits, `hits ${p.playerId}`).toBe(o.hits ?? 0);
      expect(p.giveaways, `giveaways ${p.playerId}`).toBe(o.giveaways ?? 0);
      expect(p.takeaways, `takeaways ${p.playerId}`).toBe(o.takeaways ?? 0);
      // The catch-up for older games counts the same way.
      expect(counts.get(p.playerId) ?? { hits: 0, giveaways: 0, takeaways: 0 }).toEqual({ hits: p.hits, giveaways: p.giveaways, takeaways: p.takeaways });
      total += p.hits;
    }
    expect(total).toBeGreaterThan(10);
  });

  it("credits every 5-on-5 attempt to the skaters on the ice for both sides", () => {
    const five = shots.filter((s) => s.strength === "5v5");
    for (const teamId of [pbp.homeTeam.id, pbp.awayTeam.id]) {
      const team = players.filter((p) => p.teamId === teamId && p.pos !== "G");
      const cf = team.reduce((s, p) => s + p.cf, 0);
      const ca = team.reduce((s, p) => s + p.ca, 0);
      // Five skaters on the ice for (almost) every attempt; line changes can leave one short.
      expect(cf).toBeGreaterThan(4.8 * five.filter((s) => s.teamId === teamId).length);
      expect(cf).toBeLessThanOrEqual(5 * five.filter((s) => s.teamId === teamId).length);
      expect(ca).toBeLessThanOrEqual(5 * five.filter((s) => s.oppTeamId === teamId).length);
    }
  });

  it("finds forward lines of three and defence pairs of two", () => {
    expect(units.some((u) => u.kind === "F" && u.players.length === 3)).toBe(true);
    expect(units.some((u) => u.kind === "D" && u.players.length === 2)).toBe(true);
    for (const u of units) expect(u.toi5).toBeGreaterThan(0);
  });

  it("Game Score uses the standard weights", () => {
    const zero = { goals: 0, a1: 0, a2: 0, sog: 0, blk: 0, pd: 0, pt: 0, fow: 0, fol: 0, cf: 0, ca: 0, gf: 0, ga: 0 };
    expect(skaterGameScore({ ...zero, goals: 1, sog: 1 })).toBeCloseTo(0.825);
    expect(skaterGameScore({ ...zero, a1: 1, a2: 1 })).toBeCloseTo(1.25);
    expect(skaterGameScore({ ...zero, cf: 10, ca: 4, gf: 1, ga: 2 })).toBeCloseTo(0.15);
    expect(skaterGameScore({ ...zero, pd: 1, pt: 2, fow: 10, fol: 5 })).toBeCloseTo(-0.1);
    // A hat trick on opening night is the best game on either side.
    const best = [...players].sort((a, b) => b.gameScore - a.gameScore)[0];
    expect(best.goals).toBe(3);
  });

  it("goalies are scored on goals saved above expected", () => {
    const goalies = players.filter((p) => p.pos === "G");
    expect(goalies).toHaveLength(2);
    for (const g of goalies) expect(g.gameScore).toBeCloseTo(0.75 * g.gsax!);
  });
});

describe("ratings", () => {
  const sample = Array.from({ length: 1001 }, (_, i) => (i - 200) / 200); // −1 to 4, evenly spread
  const cutoffs = calibrate(sample);

  it("maps each anchor percentile to its rating", () => {
    RATING_ANCHORS.forEach(([, r], i) => expect(rate(cutoffs[i], cutoffs)).toBe(r));
  });

  it("is monotonic and stays between 3 and 10", () => {
    let prev = 0;
    for (const gs of [-5, -1, 0, 0.5, 1, 2, 3, 3.9, 10]) {
      const r = rate(gs, cutoffs);
      expect(r).toBeGreaterThanOrEqual(prev);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(10);
      prev = r;
    }
  });

  it("the middle of the distribution rates as average", () => {
    expect(rate(sample[500], cutoffs)).toBeGreaterThanOrEqual(5);
    expect(rate(sample[500], cutoffs)).toBeLessThan(6);
  });
});

describe("regular lines", () => {
  const u = (kind: "F" | "D", players: number[], toi5: number): Unit => ({ kind, players, toi5, gp: 1, cf: 0, ca: 0, gf: 0, ga: 0, xgf: 0, xga: 0, cfPct: null, xgfPct: null });
  it("picks the most-used groups that share no players", () => {
    const r = regularUnits([u("F", [1, 2, 3], 600), u("F", [1, 2, 4], 300), u("F", [4, 5, 6], 400), u("D", [7, 8], 900), u("D", [8, 9], 100)]);
    expect(r.lines.map((x) => x.players)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(r.pairs.map((x) => x.players)).toEqual([[7, 8]]);
  });
});
