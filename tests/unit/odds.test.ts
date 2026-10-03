import { describe, expect, it } from "vitest";
import { HOME_EDGE, OT_SHARE, formatOdds, gameStakes, homeWinChance, seasonLength, simulate, strengthOf, type Fixture, type OddsTeam } from "@/lib/stats/odds";

/** A 32-team league: two conferences of two divisions, every team playing `games` games (circle method). */
function league(games = 84, played = 0): { teams: OddsTeam[]; fixtures: Fixture[] } {
  const teams: OddsTeam[] = Array.from({ length: 32 }, (_, i) => ({
    abbrev: `T${String(i).padStart(2, "0")}`,
    conference: i < 16 ? "E" : "W",
    division: `D${Math.floor(i / 8)}`,
    gp: played,
    points: Math.round(played * 1.1),
    regulationWins: 0,
    strength: 0.5,
  }));
  const fixtures: Fixture[] = [];
  const ids = teams.map((t) => t.abbrev);
  for (let round = played; round < games; round++) {
    const rot = [ids[0], ...ids.slice(1).map((_, k) => ids[1 + ((k + round) % 31)])];
    for (let k = 0; k < 16; k++) fixtures.push(round % 2 ? { home: rot[k], away: rot[31 - k] } : { home: rot[31 - k], away: rot[k] });
  }
  return { teams, fixtures };
}

describe("team strength", () => {
  it("is average before any games and pulled toward average early", () => {
    expect(strengthOf(0, 0.6, 0.7)).toBe(0.5);
    // 40 games: this season's numbers count half.
    expect(strengthOf(40, 0.6, 0.6)).toBeCloseTo(0.55);
    expect(strengthOf(80, 0.6, 0.6)).toBeGreaterThan(strengthOf(10, 0.6, 0.6));
    // Expected goals count more than goals.
    expect(strengthOf(40, 0.6, 0.5)).toBeGreaterThan(strengthOf(40, 0.5, 0.6));
  });

  it("gives the home team a small edge between equal teams", () => {
    expect(homeWinChance(0.5, 0.5)).toBeCloseTo(0.5 + HOME_EDGE);
    expect(homeWinChance(0.55, 0.45)).toBeGreaterThan(0.6);
  });
});

describe("simulation", () => {
  it("finds the season length from the schedule (84 games from 2026-27)", () => {
    const { teams, fixtures } = league();
    const counts = teams.map((t) => fixtures.filter((f) => f.home === t.abbrev || f.away === t.abbrev).length);
    expect(seasonLength(teams, counts)).toBe(84);
  });

  it("equal teams before the season: half make it, about 93 points each", () => {
    const { teams, fixtures } = league();
    const odds = simulate(teams, fixtures, { runs: 2000 });
    const mean = odds.reduce((s, o) => s + o.odds, 0) / odds.length;
    expect(mean).toBeCloseTo(0.5, 5); // 16 of 32 teams make it in every simulated season
    const avgPoints = 84 * (1 + OT_SHARE / 2); // 93.7: each game hands out 2 points, 3 if it goes past regulation
    expect(odds.reduce((s, o) => s + o.projPoints, 0) / odds.length).toBeCloseTo(avgPoints, 0);
    for (const o of odds) {
      expect(o.odds).toBeGreaterThan(0.4);
      expect(o.odds).toBeLessThan(0.6);
      expect(Math.abs(o.projPoints - avgPoints)).toBeLessThan(2);
    }
  });

  it("late in the season, a team far ahead is nearly certain and one far behind nearly out", () => {
    const { teams, fixtures } = league(84, 76);
    teams[0].points = 110;
    teams[1].points = 60;
    const odds = simulate(teams, fixtures, { runs: 2000 });
    expect(odds[0].odds).toBeGreaterThan(0.99);
    expect(odds[1].odds).toBeLessThan(0.01);
  });

  it("stronger teams have better odds, and the same inputs give the same answer", () => {
    const { teams, fixtures } = league(84, 20);
    teams[3].strength = 0.56;
    teams[4].strength = 0.44;
    const a = simulate(teams, fixtures, { runs: 2000 });
    expect(a[3].odds).toBeGreaterThan(a[4].odds + 0.3);
    expect(simulate(teams, fixtures, { runs: 2000 })).toEqual(a);
  });

  it("teams missing from the schedule still play a full season", () => {
    const { teams } = league();
    const odds = simulate(teams, [], { runs: 2000 });
    expect(odds.reduce((s, o) => s + o.projPoints, 0) / odds.length).toBeCloseTo(84 * (1 + OT_SHARE / 2), 0);
  });
});

describe("what's at stake", () => {
  it("a win helps more than an OT loss, which helps more than a loss", () => {
    // 16 teams, two divisions: 6 division places + 2 wild cards, so half get in.
    const teams: OddsTeam[] = Array.from({ length: 16 }, (_, i) => ({
      abbrev: `T${i}`,
      conference: "W",
      division: i < 8 ? "P" : "C",
      gp: 40,
      points: 44,
      regulationWins: 15,
      strength: 0.5,
    }));
    const fixtures: Fixture[] = [];
    let id = 1;
    for (let r = 0; r < 3; r++) for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) fixtures.push({ home: `T${i}`, away: `T${j}`, id: id++ });
    const s = gameStakes(teams, fixtures, 1, "T0", { runs: 2000 })!;
    expect(s.win).toBeGreaterThan(s.otLoss);
    expect(s.otLoss).toBeGreaterThan(s.loss);
    expect(s.now).toBeGreaterThan(s.loss);
    expect(s.now).toBeLessThan(s.win);
    // From the away side too, and only for a team that's actually in the game.
    expect(gameStakes(teams, fixtures, 1, "T1", { runs: 500 })!.win).toBeGreaterThan(gameStakes(teams, fixtures, 1, "T1", { runs: 500 })!.loss);
    expect(gameStakes(teams, fixtures, 1, "T5")).toBeNull();
  });
});

describe("showing odds", () => {
  it("never shows 0% or 100%", () => {
    expect(formatOdds(0)).toBe("<1%");
    expect(formatOdds(0.004)).toBe("<1%");
    expect(formatOdds(0.62)).toBe("62%");
    expect(formatOdds(0.996)).toBe(">99%");
    expect(formatOdds(1)).toBe(">99%");
  });
});
