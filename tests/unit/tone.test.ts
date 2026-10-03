import { describe, expect, it } from "vitest";
import { oddsTone, rankTone, ranksReady, ratingTone, signedTone, streakTone, trendTone } from "@/lib/tone";

describe("colour rules", () => {
  it("ranks: top half green, bottom half red, exact middle plain", () => {
    expect(rankTone(1, 32)).toBe("text-win");
    expect(rankTone(16, 32)).toBe("text-win");
    expect(rankTone(17, 32)).toBe("text-loss");
    expect(rankTone(8, 15)).toBe("");
    expect(rankTone(null, 32)).toBe("");
  });

  it("streaks: W green, L and OT red", () => {
    expect(streakTone("W")).toBe("text-win");
    expect(streakTone("L")).toBe("text-loss");
    expect(streakTone("OT")).toBe("text-loss");
    expect(streakTone(undefined)).toBe("");
  });

  it("odds: green above 50%, red below, plain at even", () => {
    expect(oddsTone(0.62)).toBe("text-win");
    expect(oddsTone(0.38)).toBe("text-loss");
    expect(oddsTone(0.502)).toBe(""); // shows as 50%
  });

  it("ratings: above 5.0 green, below red, 5.0 plain", () => {
    expect(ratingTone(6.2)).toBe("text-win");
    expect(ratingTone(4.9)).toBe("text-loss");
    expect(ratingTone(5.04)).toBe(""); // shows as 5.0
  });

  it("plus/minus values are judged on the number shown", () => {
    expect(signedTone(3)).toBe("text-win");
    expect(signedTone(-1)).toBe("text-loss");
    expect(signedTone(0)).toBe("");
    expect(signedTone(0.04, 1)).toBe(""); // shows as 0.0
    expect(signedTone(-0.06, 1)).toBe("text-loss");
    expect(signedTone(-0.004, 2)).toBe("");
    expect(signedTone(null)).toBe("");
  });

  it("trends: better green, worse red, flat plain", () => {
    expect(trendTone("better")).toBe("text-win");
    expect(trendTone("worse")).toBe("text-loss");
    expect(trendTone("flat")).toBe("");
  });

  it("ranks wait until every team has played", () => {
    expect(ranksReady(15, 32)).toBe(false);
    expect(ranksReady(32, 32)).toBe(true);
    expect(ranksReady(0, 0)).toBe(false);
  });
});
