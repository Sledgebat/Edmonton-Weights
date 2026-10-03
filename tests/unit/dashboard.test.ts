import { describe, expect, it } from "vitest";
import { comebackText, stolenText } from "@/lib/badges";
import { seasonSeries, seriesLine } from "@/lib/h2h";
import { milestoneText, nextMilestones, playerTotals, withinReach } from "@/lib/milestones";
import type { PlayerLanding, ScheduleGame } from "@/lib/nhl";
import { currentRuns, streakBoard, type LogGame, type PlayerRuns } from "@/lib/streaks";

// ------------------------------------------------------------------ streaks

const log = (...games: [number, number][]): LogGame[] =>
  // Oldest first here; the function sorts by date itself.
  games.map(([g, a], i) => ({ gameDate: `2026-10-${String(i + 1).padStart(2, "0")}`, goals: g, assists: a, points: g + a }));

describe("streaks", () => {
  it("counts the current point and goal streaks from the newest game back", () => {
    const r = currentRuns(log([1, 0], [0, 0], [0, 2], [1, 1], [2, 0]));
    expect(r).toMatchObject({ points: 3, pointsGoals: 3, pointsAssists: 3, goals: 2, goalsScored: 3, goalless: 0, pointless: 0 });
  });

  it("counts droughts the same way", () => {
    const r = currentRuns(log([1, 0], [0, 1], [0, 0], [0, 0], [0, 0]));
    expect(r).toMatchObject({ points: 0, goals: 0, pointless: 3, goalless: 4 });
    expect(currentRuns([])).toMatchObject({ points: 0, goalless: 0 });
  });

  it("lists streaks of 3+ points and 2+ goals, and droughts only for regulars", () => {
    const p = (id: number, gp: number, runs: Partial<PlayerRuns["runs"]>): PlayerRuns => ({
      id,
      name: `P${id}`,
      gp,
      runs: { points: 0, pointsGoals: 0, pointsAssists: 0, goals: 0, goalsScored: 0, goalless: 0, pointless: 0, ...runs },
    });
    const b = streakBoard([p(1, 12, { points: 5, goals: 2 }), p(2, 12, { points: 2 }), p(3, 12, { goalless: 9, pointless: 6 }), p(4, 4, { goalless: 4 }), p(5, 12, { goalless: 4 })]);
    expect(b.pointStreaks.map((x) => x.id)).toEqual([1]);
    expect(b.goalStreaks.map((x) => x.id)).toEqual([1]);
    expect(b.goalless.map((x) => x.id)).toEqual([3]);
    expect(b.pointless.map((x) => x.id)).toEqual([3]);
  });
});

// ------------------------------------------------------------------ milestones

describe("milestones", () => {
  it("finds the next round number and whether it's within reach", () => {
    const ms = nextMilestones({ games: 795, goals: 409, assists: 813, points: 1222 }, "career");
    expect(ms.find((m) => m.stat === "goals")).toMatchObject({ target: 450, toGo: 41 });
    expect(ms.find((m) => m.stat === "games")).toMatchObject({ target: 800, toGo: 5 });
    expect(withinReach(ms).map((m) => m.stat)).toEqual(["games"]);
    expect(milestoneText(ms.find((m) => m.stat === "games")!)).toBe("5 games from 800");
  });

  it("reads one point away as singular, and team milestones say so", () => {
    const [m] = nextMilestones({ points: 1299 }, "career");
    expect(milestoneText(m)).toBe("1 point from 1,300");
    const [t] = nextMilestones({ games: 491 }, "team");
    expect(milestoneText(t)).toBe("9 games from 500 as an Oiler");
    // Exactly on a milestone: the next one is a full step away.
    expect(nextMilestones({ goals: 500 }, "career")[0]).toMatchObject({ target: 550, toGo: 50 });
  });

  it("adds up a player's NHL seasons with the team; goalies count wins and shutouts", () => {
    const landing = {
      position: "G",
      careerTotals: { regularSeason: { gamesPlayed: 300, wins: 148, shutouts: 19 } },
      seasonTotals: [
        { season: 20242025, gameTypeId: 2, leagueAbbrev: "NHL", teamName: { default: "Edmonton Oilers" }, gamesPlayed: 50, wins: 30, shutouts: 2 },
        { season: 20252026, gameTypeId: 2, leagueAbbrev: "NHL", teamName: { default: "Edmonton Oilers" }, gamesPlayed: 45, wins: 25, shutouts: 1 },
        { season: 20252026, gameTypeId: 3, leagueAbbrev: "NHL", teamName: { default: "Edmonton Oilers" }, gamesPlayed: 20, wins: 12, shutouts: 1 },
        { season: 20232024, gameTypeId: 2, leagueAbbrev: "NHL", teamName: { default: "Pittsburgh Penguins" }, gamesPlayed: 40, wins: 20, shutouts: 3 },
      ],
    } as unknown as PlayerLanding;
    const t = playerTotals(landing, "Edmonton Oilers");
    expect(t.goalie).toBe(true);
    expect(t.career).toEqual({ games: 300, wins: 148, shutouts: 19 });
    expect(t.team).toEqual({ games: 95, wins: 55, shutouts: 3 });
    expect(withinReach(nextMilestones(t.career, "career")).map((m) => m.stat)).toEqual(["shutouts", "wins"]);
  });
});

// ------------------------------------------------------------------ head-to-head

const sg = (id: number, date: string, home: string, away: string, hs?: number, as?: number, lpt = "REG"): ScheduleGame =>
  ({
    id,
    season: 20262027,
    gameType: 2,
    gameDate: date,
    startTimeUTC: `${date}T02:00:00Z`,
    gameState: hs === undefined ? "FUT" : "OFF",
    homeTeam: { id: 1, abbrev: home, score: hs },
    awayTeam: { id: 2, abbrev: away, score: as },
    gameOutcome: hs === undefined ? undefined : { lastPeriodType: lpt },
  }) as unknown as ScheduleGame;

describe("season series", () => {
  it("before they've met: first of N meetings", () => {
    const games = [sg(1, "2026-10-03", "EDM", "SEA"), sg(2, "2026-12-01", "SEA", "EDM"), sg(3, "2026-10-05", "EDM", "CGY")];
    const s = seasonSeries(games, "EDM", "SEA", 1);
    expect(s).toMatchObject({ total: 2, tonight: 1, leftAfter: 1 });
    expect(seriesLine(s)).toBe("First of 2 meetings");
  });

  it("after some meetings: the record from our side and how many are left", () => {
    const games = [sg(1, "2026-10-03", "EDM", "SEA", 4, 2), sg(2, "2026-11-01", "SEA", "EDM", 3, 2, "OT"), sg(3, "2026-12-01", "EDM", "SEA"), sg(4, "2027-02-01", "SEA", "EDM")];
    const s = seasonSeries(games, "EDM", "SEA", 3);
    expect(s.record).toEqual({ w: 1, l: 0, otl: 1 });
    expect(s.played.map((m) => m.outcome)).toEqual(["W", "OTL"]);
    expect(seriesLine(s)).toBe("Season series 1-0-1 · 1 meeting left");
    expect(seriesLine(seasonSeries(games, "EDM", "SEA", 4))).toBe("Season series 1-0-1 · last meeting");
  });
});

// ------------------------------------------------------------------ badges

describe("last-game badges", () => {
  it("only a win after trailing by 2+ is a comeback", () => {
    expect(comebackText(-2, true)).toBe("Came back from 2 down");
    expect(comebackText(-1, true)).toBeNull();
    expect(comebackText(-3, false)).toBeNull();
    expect(stolenText("Jarry", 2.43)).toBe("Stolen by Jarry, +2.4 GSAx");
  });
});
