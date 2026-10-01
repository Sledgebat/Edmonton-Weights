import { describe, expect, it } from "vitest";
import {
  endpoints,
  fixturePathFor,
  isFinished,
  isLive,
  previousSeason,
  seasonLabel,
  seasonsSince,
} from "@/lib/nhl/endpoints";

describe("endpoint paths", () => {
  it("builds the paths from the plan's Data sources table", () => {
    expect(endpoints.standingsNow()).toBe("/standings/now");
    expect(endpoints.scheduleNow()).toBe("/club-schedule-season/EDM/now");
    expect(endpoints.gamePlayByPlay(2025020001)).toBe("/gamecenter/2025020001/play-by-play");
    expect(endpoints.playerGameLog(8478402, 20252026, 2)).toBe("/player/8478402/game-log/20252026/2");
  });

  it("maps endpoints to fixture files", () => {
    expect(fixturePathFor("/standings/now")).toBe("v1/standings/now.json");
    expect(fixturePathFor("/gamecenter/1/landing")).toBe("v1/gamecenter/1/landing.json");
    expect(fixturePathFor("/stats/rest/en/team/summary?cayenneExp=seasonId=20262027%20and%20gameTypeId=2")).toBe(
      "v1/stats/rest/en/team/summary__cayenneExp=seasonId=20262027_and_gameTypeId=2.json",
    );
    expect(() => fixturePathFor("/../etc/passwd")).toThrow();
  });
});

describe("seasons", () => {
  it("labels and steps seasons", () => {
    expect(seasonLabel(20262027)).toBe("2026-27");
    expect(seasonLabel(19992000)).toBe("1999-00");
    expect(previousSeason(20262027)).toBe(20252026);
  });

  it("lists every season since 1979-80", () => {
    const all = seasonsSince(19791980, 20262027);
    expect(all[0]).toBe(19791980);
    expect(all.at(-1)).toBe(20262027);
    expect(all).toHaveLength(2026 - 1979 + 1);
  });
});

describe("game states", () => {
  it("classifies live and finished states", () => {
    expect(isLive("CRIT")).toBe(true);
    expect(isLive("PRE")).toBe(false);
    expect(isFinished("OFF")).toBe(true);
    expect(isFinished("LIVE")).toBe(false);
  });
});
