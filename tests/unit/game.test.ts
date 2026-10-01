import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GameLanding, PlayByPlay } from "@/lib/nhl/schemas";
import { analyzeGame, summarize } from "@/lib/stats/game";

const read = (id: string, kind: string) => JSON.parse(readFileSync(`fixtures/v1/gamecenter/${id}/${kind}.json`, "utf8"));
const finished = () => analyzeGame(PlayByPlay.parse(read("2026020004", "play-by-play")), GameLanding.parse(read("2026020004", "landing")));

describe("game report", () => {
  it("totals match the box score and add up", () => {
    const r = finished();
    expect(r.home.abbrev).toBe("EDM");
    expect([r.away.goals, r.home.goals]).toEqual([6, 5]);
    expect(r.decidedIn).toBe("OT");
    for (const side of ["home", "away"] as const) {
      const t = r[side];
      expect(t.xg).toBeGreaterThan(0);
      expect(t.hd).toBeLessThanOrEqual(t.unblocked);
      expect(t.unblocked).toBeLessThanOrEqual(t.attempts);
      // Strength rows partition every attempt and every goal.
      expect(r.strength.reduce((a, s) => a + s.attempts[side], 0)).toBe(t.attempts);
      expect(r.strength.reduce((a, s) => a + s.xg[side], 0)).toBeCloseTo(t.xg, 6);
      // Players' xG sums to the team's.
      expect(r.players.filter((p) => p.side === side).reduce((a, p) => a + p.ixg, 0)).toBeCloseTo(t.xg, 6);
    }
  });

  it("builds a cumulative timeline that ends at each team's total", () => {
    const r = finished();
    const last = r.timeline.at(-1)!;
    expect(last.home).toBeCloseTo(r.home.xg, 6);
    expect(last.away).toBeCloseTo(r.away.xg, 6);
    for (let i = 1; i < r.timeline.length; i++) expect(r.timeline[i].minute).toBeGreaterThanOrEqual(r.timeline[i - 1].minute);
    expect(r.goals).toHaveLength(11);
    expect(r.periods).toEqual([20, 40, 60]);
  });

  it("credits goalies with GSAx = xGA − GA", () => {
    const r = finished();
    expect(r.goalies).toHaveLength(2);
    for (const g of r.goalies) expect(g.gsax).toBeCloseTo(g.xga - g.goalsAllowed, 6);
    const jarry = r.goalies.find((g) => g.side === "home")!;
    expect(jarry.goalsAllowed).toBe(6);
  });

  it("writes a plain-language summary", () => {
    const r = finished();
    expect(r.summary).toMatch(/^Canucks beat the Oilers 6–5 in overtime despite being out-chanced/);
    expect(summarize({ ...r, state: "FUT" })).toBe("");
    expect(summarize({ ...r, state: "LIVE" })).toMatch(/^Canucks lead 6–5\. Oilers have the better chances so far/);
  });

  it("handles a game that hasn't started", () => {
    const r = analyzeGame(PlayByPlay.parse(read("2026020015", "play-by-play")));
    expect(r.shots).toHaveLength(0);
    expect(r.summary).toBe("");
  });
});
