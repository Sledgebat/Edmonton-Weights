import { describe, expect, it } from "vitest";
import { isBadStart, isQualityStart, isStolen, summariseStarts, type GoalieGame } from "@/lib/stats/goalies";
import { MIN_P60_SECONDS, pointsPer60 } from "@/lib/stats/skaters";

const LEAGUE = 0.9;

describe("quality starts", () => {
  it("league-average save % or better is a quality start", () => {
    expect(isQualityStart(30, 3, LEAGUE)).toBe(true); // .900
    expect(isQualityStart(30, 4, LEAGUE)).toBe(false); // .867 on 30 shots
  });

  it("on 20 shots or fewer, .885 is enough", () => {
    expect(isQualityStart(20, 2, LEAGUE)).toBe(true); // .900
    expect(isQualityStart(26, 3, LEAGUE)).toBe(false); // .885 but 26 shots
    expect(isQualityStart(9, 1, LEAGUE)).toBe(true); // .889
    expect(isQualityStart(8, 1, LEAGUE)).toBe(false); // .875
  });

  it("a shutout with no shots still counts; below .850 is a really bad start", () => {
    expect(isQualityStart(0, 0, LEAGUE)).toBe(true);
    expect(isBadStart(20, 4)).toBe(true); // .800
    expect(isBadStart(20, 3)).toBe(false); // .850
  });

  it("a stolen game is a win with 2+ goals saved above expected, and at least the winning margin", () => {
    expect(isStolen({ won: true, gsax: 2.4, margin: 1 })).toBe(true);
    expect(isStolen({ won: true, gsax: 1.9, margin: 1 })).toBe(false);
    expect(isStolen({ won: false, gsax: 3.5, margin: -1 })).toBe(false);
    // A 6-0 win isn't stolen, however good the goalie was.
    expect(isStolen({ won: true, gsax: 3.4, margin: 6 })).toBe(false);
  });

  it("adds up starts per goalie and team; relief appearances aren't starts", () => {
    const g = (over: Partial<GoalieGame>): GoalieGame => ({ gameId: 1, goalieId: 30, teamId: 22, started: true, won: true, margin: 1, shots: 30, goals: 2, gsax: 0, hdShots: 5, hdGoals: 1, ...over });
    const rows = summariseStarts(
      [
        g({ gameId: 1 }),
        g({ gameId: 2, goals: 6, won: false }),
        g({ gameId: 3, gsax: 2.5 }),
        g({ gameId: 4, started: false, shots: 10, goals: 3, won: false }),
        g({ gameId: 5, teamId: 10 }),
      ],
      LEAGUE,
    );
    const edm = rows.find((r) => r.teamId === 22)!;
    expect(edm).toMatchObject({ starts: 3, qualityStarts: 2, badStarts: 1, stolen: 1, hdShots: 20, hdGoals: 4 });
    expect(rows.find((r) => r.teamId === 10)!.starts).toBe(1);
  });
});

describe("5-on-5 points per 60", () => {
  it("needs enough ice time and goal data", () => {
    expect(pointsPer60(5, 150 * 60)).toBeCloseTo(2);
    expect(pointsPer60(2, MIN_P60_SECONDS - 1)).toBeNull();
    expect(pointsPer60(null, 200 * 60)).toBeNull();
  });
});
