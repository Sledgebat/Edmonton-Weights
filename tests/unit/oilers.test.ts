import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ClubSchedule, ClubStats, Standings } from "@/lib/nhl/schemas";
import {
  age,
  byMonth,
  divisionTable,
  lastGame,
  nextGame,
  ordinal,
  record,
  streakLabel,
  teamOf,
  teamView,
  topScorers,
  wildCardTable,
} from "@/lib/oilers";

const fx = (p: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../../fixtures/v1", p), "utf8"));
const schedule = ClubSchedule.parse(fx("club-schedule-season/EDM/now.json"));
const standings = Standings.parse(fx("standings/now.json")).standings;
const stats = ClubStats.parse(fx("club-stats/EDM/now.json"));
const history = ClubSchedule.parse(fx("club-schedule-season/EDM/19831984.json"));

describe("results", () => {
  it("reads the opening-night OT loss to Vancouver correctly", () => {
    const g = schedule.games.find((x) => x.id === 2026020004)!;
    const v = teamView(g);
    expect(v.isHome).toBe(true);
    expect(v.opp.abbrev).toBe("VAN");
    expect([v.us.score, v.opp.score]).toEqual([5, 6]);
    expect(v.outcome).toBe("OTL");
    expect(v.decidedIn).toBe("OT");
  });

  it("finds the last regular-season result and the next game", () => {
    expect(lastGame(schedule.games)?.id).toBe(2026020004);
    const next = nextGame(schedule.games)!;
    expect(next.gameState).toBe("FUT");
    expect(next.startTimeUTC > lastGame(schedule.games)!.startTimeUTC).toBe(true);
  });

  it("builds records, including the 1983-84 Cup season", () => {
    expect(record(schedule.games, 2)).toEqual({ w: 0, l: 0, otl: 1 });
    // 1983-84 regular season: 57-18-5 (ties count with OTL in this column).
    const r = record(history.games, 2);
    expect(r.w).toBe(57);
    expect(r.w + r.l + r.otl).toBe(80);
  });

  it("groups the schedule by month in order", () => {
    const months = byMonth(schedule.games);
    expect(months[0].label).toMatch(/September 2026/);
    expect(months.reduce((n, m) => n + m.games.length, 0)).toBe(schedule.games.length);
  });
});

describe("standings", () => {
  it("division table is ordered and Edmonton is in the Pacific", () => {
    const pac = divisionTable(standings, "P");
    expect(pac).toHaveLength(8);
    expect(pac.map((r) => r.divisionSequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pac.some((r) => teamOf(r) === "EDM")).toBe(true);
  });

  it("wild card view: 3 leaders per division, everyone else ranked, 16 teams total", () => {
    const wc = wildCardTable(standings, "W");
    expect(wc.leaders).toHaveLength(2);
    expect(wc.leaders.every((l) => l.rows.length === 3)).toBe(true);
    expect(wc.wildCard).toHaveLength(10);
    expect(wc.wildCard[0].wildcardSequence).toBe(1);
  });

  it("formats streaks and ordinals", () => {
    expect(streakLabel({ streakCode: "W", streakCount: 3 })).toBe("W3");
    expect(streakLabel({ streakCode: undefined, streakCount: undefined })).toBe("");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});

describe("players", () => {
  it("top scorers are sorted by points then goals", () => {
    const top = topScorers(stats.skaters);
    expect(top).toHaveLength(3);
    expect(top[0].points).toBeGreaterThanOrEqual(top[1].points);
    expect(top[1].points).toBeGreaterThanOrEqual(top[2].points);
  });

  it("computes age on a date", () => {
    expect(age("1997-01-13", new Date("2026-10-01T00:00:00Z"))).toBe(29);
    expect(age("1997-01-13", new Date("2027-01-12T00:00:00Z"))).toBe(29);
    expect(age("1997-01-13", new Date("2027-01-13T00:00:00Z"))).toBe(30);
  });
});
