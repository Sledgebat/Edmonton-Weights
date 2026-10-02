import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, setDbForTests } from "@/db";
import { PlayByPlay } from "@/lib/nhl/schemas";
import { clutchKind, clutchSummary, clutchTable, clutchValue, extractGoals, hasGoalData } from "@/lib/stats/clutch";
import { gamesNeedingGoals, ingestGame } from "@/lib/stats/ingest";

const load = (p: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../../fixtures/v1", p), "utf8"));
// Oilers 5, Canucks 6 (OT), 2026-09-29: Edmonton tied it at 19:17 of the third with the goalie
// pulled, Vancouver won it 1:59 into overtime.
const pbp = PlayByPlay.parse(load("gamecenter/2026020004/play-by-play.json"));
const EDM = 22;
const VAN = 23;

const base = { gameType: 2, period: 3, periodType: "REG" as const, periodSeconds: 900, ownGoalieIn: true, oppGoalieIn: true };

describe("clutch rules", () => {
  it("only counts the last 10 minutes of the third and overtime, within a goal", () => {
    expect(clutchKind({ ...base, ownBefore: 1, oppBefore: 2 })).toBe("tying");
    expect(clutchKind({ ...base, ownBefore: 2, oppBefore: 2 })).toBe("goAhead");
    expect(clutchKind({ ...base, ownBefore: 3, oppBefore: 2 })).toBe("insurance");
    expect(clutchKind({ ...base, ownBefore: 0, oppBefore: 2 })).toBeNull(); // still down one after
    expect(clutchKind({ ...base, ownBefore: 4, oppBefore: 2 })).toBeNull();
    expect(clutchKind({ ...base, periodSeconds: 599, ownBefore: 2, oppBefore: 2 })).toBeNull(); // 9:59 of the third
    expect(clutchKind({ ...base, periodSeconds: 600, ownBefore: 2, oppBefore: 2 })).toBe("goAhead"); // 10:00
    expect(clutchKind({ ...base, period: 2, ownBefore: 2, oppBefore: 2 })).toBeNull();
    expect(clutchKind({ ...base, period: 4, periodType: "OT", periodSeconds: 30, ownBefore: 2, oppBefore: 2 })).toBe("ot");
  });

  it("weights goals, with bonuses and exceptions", () => {
    expect(clutchValue({ ...base, period: 4, periodType: "OT", ownBefore: 1, oppBefore: 1 })).toBe(3);
    expect(clutchValue({ ...base, ownBefore: 1, oppBefore: 2 })).toBe(2);
    expect(clutchValue({ ...base, ownBefore: 1, oppBefore: 2, ownGoalieIn: false })).toBe(2.5);
    expect(clutchValue({ ...base, ownBefore: 2, oppBefore: 1 })).toBe(0.5);
    expect(clutchValue({ ...base, ownBefore: 2, oppBefore: 1, oppGoalieIn: false })).toBe(0); // empty-netter
    expect(clutchValue({ ...base, gameType: 3, ownBefore: 1, oppBefore: 1 })).toBe(3); // playoffs ×1.5
    expect(clutchValue({ ...base, period: 1, ownBefore: 1, oppBefore: 1 })).toBe(0);
  });

  it("explains a score in words", () => {
    expect(clutchSummary({ ot: 2, tying: 1, goAhead: 0, insurance: 0, assists: 1 })).toBe("2 OT winners, 1 late equalizer, 1 clutch assist");
  });
});

describe("goals from play-by-play", () => {
  const goals = extractGoals(pbp);

  it("finds every goal with the score before it", () => {
    expect(goals).toHaveLength(11);
    expect(goals[0]).toMatchObject({ teamId: VAN, ownBefore: 0, oppBefore: 0 });
    const tying = goals[9];
    expect(tying).toMatchObject({ teamId: EDM, scorerId: 8481617, a1Id: 8477934, a2Id: 8480803, ownBefore: 4, oppBefore: 5, ownGoalieIn: false, periodSeconds: 19 * 60 + 17 });
    expect(goals[10]).toMatchObject({ teamId: VAN, periodType: "OT", ownBefore: 5, oppBefore: 5, scorerId: 8481032 });
  });
});

describe("clutch table", () => {
  afterEach(() => setDbForTests(undefined));

  it("credits scorers and assists league-wide, best first", () => {
    setDbForTests(openDb(":memory:"));
    expect(hasGoalData(pbp.season)).toBe(false);
    ingestGame(pbp);
    expect(hasGoalData(pbp.season)).toBe(true);
    expect(gamesNeedingGoals([pbp.season])).toEqual([]);

    const t = clutchTable(pbp.season);
    const by = new Map(t.map((r) => [r.playerId, r]));
    expect(t[0]).toMatchObject({ playerId: 8481032, score: 3, goals: 1, ot: 1, rank: 1, team: "VAN" }); // OT winner
    expect(by.get(8481617)).toMatchObject({ score: 2.5, tying: 1, team: "EDM" }); // tying goal, goalie pulled
    expect(by.get(8484136)?.score).toBe(2.1); // primary assist on the OT winner
    expect(by.get(8477934)?.score).toBe(1.75);
    expect(by.get(8480803)).toMatchObject({ score: 1.25, goals: 0, assists: 1 });
    expect(t).toHaveLength(5);
    expect(t.every((r) => r.name && !r.name.startsWith("Player "))).toBe(true);
  });
});
