import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { keysToTheGame, rankOf, type TapeRow } from "@/lib/home";
import { playoffPicture } from "@/lib/magic";
import { Standings, type StandingsRow } from "@/lib/nhl/schemas";

const standings = Standings.parse(JSON.parse(readFileSync(path.resolve(__dirname, "../../fixtures/v1/standings/now.json"), "utf8"))).standings;

/** Copy of the fixture standings with made-up points and games played, to test late-season maths. */
function withPoints(points: Record<string, [number, number]>): StandingsRow[] {
  return standings.map((r) => {
    const [pts, gp] = points[r.teamAbbrev.default] ?? [r.points, r.gamesPlayed];
    return { ...r, points: pts, gamesPlayed: gp };
  });
}

describe("playoff picture", () => {
  it("early season: pace and cushion, no magic number", () => {
    const p = playoffPicture(standings)!;
    expect(p.showNumbers).toBe(false);
    expect(p.magicNumber).toBeNull();
    expect(p.inPlayoffSpot).toBe(true);
    expect(p.pace).toBe(84); // 1 point in 1 game, 84-game season (from 2026-27)
    expect(playoffPicture(standings, "EDM", 82)!.pace).toBe(82); // earlier seasons
  });

  it("late season: magic number against the first team out, using their maximum possible points", () => {
    // Give every Western team 70 games; Edmonton 100 points, everyone else below.
    const west = Object.fromEntries(standings.filter((r) => r.conferenceAbbrev === "W").map((r, i) => [r.teamAbbrev.default, [60 + i, 70] as [number, number]]));
    const rows = withPoints({ ...west, EDM: [100, 70] });
    // Re-rank like the NHL would (by points) so the wild-card table is right.
    const ranked = rankWest(rows);
    const p = playoffPicture(ranked)!;
    expect(p.showNumbers).toBe(true);
    expect(p.inPlayoffSpot).toBe(true);
    const firstOut = p.rival!;
    const max = firstOut.points + 2 * (p.seasonGames - firstOut.gamesPlayed);
    expect(p.magicNumber).toBe(Math.max(0, max - 100 + 1));
  });

  it("clinched when the first team out can't catch up", () => {
    const west = Object.fromEntries(standings.filter((r) => r.conferenceAbbrev === "W").map((r) => [r.teamAbbrev.default, [50, 80] as [number, number]]));
    const p = playoffPicture(rankWest(withPoints({ ...west, EDM: [110, 80] })))!;
    expect(p.clinched).toBe(true);
    expect(p.magicNumber).toBe(0);
  });
});

function rankWest(rows: StandingsRow[]): StandingsRow[] {
  const west = rows.filter((r) => r.conferenceAbbrev === "W").sort((a, b) => b.points - a.points);
  const byDiv = new Map<string, StandingsRow[]>();
  for (const r of west) byDiv.set(r.divisionAbbrev, [...(byDiv.get(r.divisionAbbrev) ?? []), r]);
  const out = rows.map((r) => ({ ...r }));
  for (const [, list] of byDiv) list.forEach((r, i) => (out.find((o) => o.teamAbbrev.default === r.teamAbbrev.default)!.divisionSequence = i + 1));
  const leaders = new Set([...byDiv.values()].flatMap((l) => l.slice(0, 3).map((r) => r.teamAbbrev.default)));
  west.filter((r) => !leaders.has(r.teamAbbrev.default)).forEach((r, i) => (out.find((o) => o.teamAbbrev.default === r.teamAbbrev.default)!.wildcardSequence = i + 1));
  return out;
}

describe("home helpers", () => {
  it("ranks with ties sharing a place, in either direction", () => {
    expect(rankOf(3, [1, 2, 3, 3, 4], true)).toBe(2);
    expect(rankOf(3, [1, 2, 3, 3, 4], false)).toBe(3);
  });

  it("keys to the game pick the biggest gaps, one from each side when there are both", () => {
    const row = (label: string, us: number, them: number): TapeRow => ({ key: label, label, us: { value: "", rank: us }, them: { value: "", rank: them }, of: 32 });
    const keys = keysToTheGame([row("Shot share", 3, 30), row("Power play", 25, 2), row("Penalty kill", 10, 12)], "VAN");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^Edge Edmonton: shot share, 3rd/);
    expect(keys[1]).toMatch(/^Watch for: VAN's power play ranks 2nd/);
  });
});
