import { describe, expect, it } from "vitest";
import type { SeasonTotal } from "@/lib/nhl/schemas";
import { MIN_CAREER_SHOTS, hotAndCold, nhlSeasons, shooterLine } from "@/lib/shooting";

const total = (season: number, goals: number, shots: number, extra: Partial<SeasonTotal> = {}): SeasonTotal => ({
  season,
  gameTypeId: 2,
  leagueAbbrev: "NHL",
  goals,
  shots,
  ...extra,
});
const player = (goals: number, shots: number) => ({ id: 1, name: "Test Player", pos: "C", gp: 20, goals, shots });

describe("shooting vs career", () => {
  it("combines split seasons and ignores other leagues and playoffs", () => {
    const seasons = nhlSeasons([
      total(20232024, 10, 100, { sequence: 1 }),
      total(20232024, 5, 50, { sequence: 2 }),
      total(20232024, 9, 40, { leagueAbbrev: "AHL" }),
      total(20232024, 3, 20, { gameTypeId: 3 }),
    ]);
    expect(seasons.get(20232024)).toEqual({ goals: 15, shots: 150 });
  });

  it("compares this season with the career before it, in goals", () => {
    // Career 20 on 200 = 10%; this season 6 on 40 would usually be 4 goals: +2.
    const s = shooterLine(player(6, 40), [total(20242025, 10, 100), total(20252026, 10, 100), total(20262027, 6, 40)], 20262027);
    expect(s.careerPct).toBeCloseTo(10);
    expect(s.pct).toBeCloseTo(15);
    expect(s.vsCareer).toBeCloseTo(2);
    expect(s.seasons.map((x) => x.season)).toEqual([20242025, 20252026, 20262027]);
    expect(s.seasons.at(-1)!.current).toBe(true);
  });

  it("has no career rate without enough NHL shots", () => {
    const s = shooterLine(player(1, 5), [total(20252026, 3, MIN_CAREER_SHOTS - 1)], 20262027);
    expect(s.careerPct).toBeNull();
    expect(s.vsCareer).toBeNull();
  });

  it("picks the three hottest and coldest, ignoring players without a baseline or a shot", () => {
    const line = (id: number, vs: number | null, shots = 10) => ({ ...shooterLine(player(0, shots), [], 20262027), id, vsCareer: vs });
    const { hot, cold } = hotAndCold([line(1, 2), line(2, 1), line(3, 0.5), line(4, 0.2), line(5, -1), line(6, -3), line(7, null), line(8, 5, 0)]);
    expect(hot.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(cold.map((s) => s.id)).toEqual([6, 5]);
  });
});
