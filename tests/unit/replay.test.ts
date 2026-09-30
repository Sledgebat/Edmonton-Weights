import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  momentAt,
  periodsOf,
  replayDuration,
  snapshotAt,
  snapshotForMoment,
  type ReplayMoment,
  type ReplaySource,
} from "@/lib/nhl/replay-engine";
import { Boxscore, GameLanding, PlayByPlay } from "@/lib/nhl/schemas";

// Oilers vs Canucks, 2026-09-29: VAN won 6-5 in overtime.
const GAME = 2026020004;
const load = (name: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, `../../fixtures/v1/gamecenter/${GAME}/${name}.json`), "utf8"));
const src: ReplaySource = {
  pbp: PlayByPlay.parse(load("play-by-play")),
  landing: GameLanding.parse(load("landing")),
  boxscore: Boxscore.parse(load("boxscore")),
};
const cfg = { speed: 10, pregameSeconds: 30, intermissionSeconds: 15 };
/** The instant of the overtime winner, still "live", so every play is visible but nothing is copied from the final. */
const lastInstant: ReplayMoment = {
  state: "LIVE",
  period: 4,
  periodType: "OT",
  second: 119,
  periodLength: 300,
  inIntermission: false,
  realSecondsToFinal: 0,
};

describe("replay timeline", () => {
  it("knows the game went to overtime and ended early in OT", () => {
    const periods = periodsOf(src.pbp);
    expect(periods.map((p) => p.type)).toEqual(["REG", "REG", "REG", "OT"]);
    expect(periods[3].length).toBe(119); // game-end at 01:59 of OT
  });

  it("runs pre-game, then live, then final", () => {
    expect(momentAt(src.pbp, 0, cfg).state).toBe("PRE");
    expect(momentAt(src.pbp, 31, cfg)).toMatchObject({ state: "LIVE", period: 1, inIntermission: false });
    // End of the first period (30 s pre-game + 120 s of play) lands in the intermission.
    expect(momentAt(src.pbp, 155, cfg)).toMatchObject({ period: 1, inIntermission: true });
    expect(momentAt(src.pbp, replayDuration(src.pbp, cfg) + 1, cfg).state).toBe("FINAL");
  });

  it("takes about 7 minutes at 10x", () => {
    // 30 pre + 3 x 120 + 11.9 OT + 3 x 15 intermissions
    expect(replayDuration(src.pbp, cfg)).toBeCloseTo(30 + 360 + 11.9 + 45, 5);
  });
});

describe("replay snapshots", () => {
  it("pre-game has no plays, no score and no box score yet", () => {
    const s = snapshotAt(src, 5, cfg);
    expect(s.pbp.gameState).toBe("PRE");
    expect(s.pbp.plays).toHaveLength(0);
    expect(s.landing.homeTeam.score).toBeUndefined();
    expect(s.boxscore.playerByGameStats).toBeUndefined();
    expect(s.pbp.clock?.running).toBe(false);
  });

  it("score never goes down and matches each goal as it happens", () => {
    let prevHome = 0;
    let prevAway = 0;
    const total = replayDuration(src.pbp, cfg);
    for (let e = cfg.pregameSeconds; e <= total + 2; e += 2) {
      const s = snapshotAt(src, e, cfg);
      const h = s.pbp.homeTeam.score!;
      const a = s.pbp.awayTeam.score!;
      expect(h).toBeGreaterThanOrEqual(prevHome);
      expect(a).toBeGreaterThanOrEqual(prevAway);
      // The landing's goal list agrees with the scoreboard.
      const goals = s.landing.summary?.scoring?.flatMap((p) => p.goals) ?? [];
      expect(goals.length).toBe(h + a);
      prevHome = h;
      prevAway = a;
    }
    expect([prevHome, prevAway]).toEqual([5, 6]);
  });

  it("rebuilt shots on goal match the official totals at the end of play", () => {
    const s = snapshotForMoment(src, lastInstant);
    expect(s.pbp.homeTeam.sog).toBe(src.pbp.homeTeam.sog);
    expect(s.pbp.awayTeam.sog).toBe(src.pbp.awayTeam.sog);
  });

  it("rebuilt player goals and assists match the official box score at the end of play", () => {
    const s = snapshotForMoment(src, lastInstant);
    const official = src.boxscore.playerByGameStats!;
    const rebuilt = s.boxscore.playerByGameStats!;
    for (const side of ["homeTeam", "awayTeam"] as const) {
      const o = [...official[side].forwards, ...official[side].defense];
      const r = [...rebuilt[side].forwards, ...rebuilt[side].defense];
      for (const p of o) {
        const q = r.find((x) => x.playerId === p.playerId)!;
        expect([q.goals, q.assists, q.sog], `player ${p.playerId}`).toEqual([p.goals, p.assists, p.sog]);
      }
    }
  });

  it("the clock counts down and three stars only appear at the final", () => {
    const early = snapshotAt(src, 40, cfg);
    const later = snapshotAt(src, 60, cfg);
    expect(early.pbp.clock!.secondsRemaining).toBeGreaterThan(later.pbp.clock!.secondsRemaining);
    expect(later.landing.summary?.threeStars).toBeUndefined();
    const final = snapshotAt(src, 10_000, cfg);
    expect(final.pbp.gameState).toBe("FINAL");
    expect(final.landing.summary?.threeStars).toHaveLength(3);
  });

  it("every snapshot still passes the Zod schemas", () => {
    for (const e of [0, 40, 155, 300, 450, 10_000]) {
      const s = snapshotAt(src, e, cfg);
      expect(PlayByPlay.safeParse(s.pbp).success).toBe(true);
      expect(GameLanding.safeParse(s.landing).success).toBe(true);
      expect(Boxscore.safeParse(s.boxscore).success).toBe(true);
    }
  });
});
