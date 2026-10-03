import { describe, expect, it } from "vitest";
import { adjustTies, deservedPoints, goalDistribution, luckVerdict, outcomeChances, tieRatio, TIE_RATIO_PRIOR } from "@/lib/stats/luck";
import { FALLBACK, matchScore, personality, TYPES, type TraitRanks } from "@/lib/stats/personality";
import { gameScript, isOneGoal, pointsPct, summarise, type ScriptGame, type ScriptGoal } from "@/lib/stats/situations";
import { withReports } from "@/lib/stats/special";

// ------------------------------------------------------------------ game scripts

const EDM = 22;
const VAN = 23;
const goal = (teamId: number, period: number, periodSeconds: number, emptyNet = false): ScriptGoal => ({ teamId, period, periodType: period > 3 ? "OT" : "REG", periodSeconds, eventId: period * 10000 + periodSeconds, emptyNet });
const game = (goals: ScriptGoal[], over: Partial<ScriptGame> = {}): ScriptGame => {
  const home = goals.filter((g) => g.teamId === EDM).length;
  const away = goals.filter((g) => g.teamId === VAN).length;
  return { gameId: 1, date: "2026-10-01", homeId: EDM, awayId: VAN, homeAbbrev: "EDM", awayAbbrev: "VAN", homeScore: home, awayScore: away, lastPeriodType: "REG", goals, ...over };
};

describe("game scripts", () => {
  // VAN go up 2-0, EDM come back to win 3-2 with the winner in the 3rd.
  const comeback = game([goal(VAN, 1, 100), goal(VAN, 1, 900), goal(EDM, 2, 300), goal(EDM, 3, 50), goal(EDM, 3, 1100)]);

  it("replays the score from each side", () => {
    const s = gameScript(comeback, EDM);
    expect(s).toMatchObject({ outcome: "W", scoredFirst: false, after1: -2, after2: -1, maxLead: 1, maxDeficit: -2, margin: 1, byPeriodFor: [0, 1, 2, 0], byPeriodAgainst: [2, 0, 0, 0] });
    const v = gameScript(comeback, VAN);
    expect(v).toMatchObject({ outcome: "L", scoredFirst: true, maxLead: 2, opponent: "EDM", isHome: false });
  });

  it("an overtime or shootout loss is an OT loss; a shootout is a one-goal game", () => {
    const so = game([goal(EDM, 1, 100), goal(VAN, 2, 100)], { homeScore: 1, awayScore: 2, lastPeriodType: "SO" });
    const s = gameScript(so, EDM);
    expect(s.outcome).toBe("OTL");
    expect(s.decidedIn).toBe("SO");
    expect(isOneGoal(s)).toBe(true);
  });

  it("a two-goal win with an empty-netter counts as a one-goal game", () => {
    const en = gameScript(game([goal(EDM, 1, 100), goal(VAN, 2, 100), goal(EDM, 3, 900), goal(EDM, 3, 1190, true)]), EDM);
    expect(en.margin).toBe(2);
    expect(isOneGoal(en)).toBe(true);
    expect(isOneGoal(gameScript(game([goal(EDM, 1, 100), goal(EDM, 2, 100)]), EDM))).toBe(false);
  });

  it("adds up records, comebacks and blown leads", () => {
    const blown = game([goal(EDM, 1, 100), goal(EDM, 1, 200), goal(VAN, 2, 100), goal(VAN, 3, 100), goal(VAN, 4, 100)], { gameId: 2, lastPeriodType: "OT" });
    const s = summarise([gameScript(comeback, EDM), gameScript(blown, EDM)]);
    expect(s.allowingFirst).toEqual({ w: 1, l: 0, otl: 0 });
    expect(s.scoringFirst).toEqual({ w: 0, l: 0, otl: 1 });
    expect(s.comebackWins).toHaveLength(1);
    expect(s.biggestComeback).toBe(2);
    expect(s.blownLeads).toHaveLength(1);
    expect(s.lostLeadingAfter2).toBe(1);
    expect(s.wonTrailingAfter2).toBe(1);
    expect(s.overtime).toEqual({ w: 0, l: 0, otl: 1 });
    expect(s.goalsFor).toEqual([2, 1, 2, 0]);
    expect(pointsPct(s.scoringFirst)).toBe(0.5);
  });
});

// ------------------------------------------------------------------ luck

describe("luck meter", () => {
  it("adds shots up into the exact chance of each score", () => {
    const d = goalDistribution([0.5, 0.5]);
    expect(d).toEqual([0.25, 0.5, 0.25]);
    expect(goalDistribution([]).length).toBe(1);
    expect(goalDistribution([0.1, 0.2, 0.3]).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("win, tie and loss chances add to one and mirror for the other team", () => {
    const a = [0.1, 0.2, 0.15, 0.05];
    const b = [0.3, 0.05];
    const c = outcomeChances(a, b);
    expect(c.win + c.tie + c.loss).toBeCloseTo(1);
    const r = outcomeChances(b, a);
    expect(r.win).toBeCloseTo(c.loss);
    expect(r.tie).toBeCloseTo(c.tie);
    // No shots either way: a guaranteed 0-0 tie, worth 1.5 points on average.
    expect(deservedPoints(outcomeChances([], []))).toBeCloseTo(1.5);
  });

  it("scales ties toward the real overtime rate, keeping chances summing to one", () => {
    expect(tieRatio(0, 0)).toBeCloseTo(TIE_RATIO_PRIOR);
    expect(tieRatio(300, 200)).toBeGreaterThan(1.4);
    const adj = adjustTies({ win: 0.5, tie: 0.2, loss: 0.3 }, 1.5);
    expect(adj.tie).toBeCloseTo(0.3);
    expect(adj.win + adj.tie + adj.loss).toBeCloseTo(1);
    expect(adj.win / adj.loss).toBeCloseTo(0.5 / 0.3);
  });

  it("verdicts combine the points gap with PDO", () => {
    expect(luckVerdict(-3.2, 6.8, 0.91, 97.8)).toBe("3 points worse than they deserved, shooting 6.8% at 5 on 5 with a 91.0% save rate. Should improve.");
    expect(luckVerdict(4, 11, 0.93, 104)).toMatch(/^4 points better .* Hard to keep up\.$/);
    expect(luckVerdict(0.2, 8, 0.92, 100)).toMatch(/^Right about where/);
  });
});

// ------------------------------------------------------------------ personality

describe("personality", () => {
  const middle: TraitRanks = { xgf60: 16, xga60: 16, xgfPct: 16, cfPct: 16, hdcfPct: 16, gsax: 16, pdo: 16, pp: 16, pk: 16, luck: 16, penalties: 16 };

  it("an average team is middle of the pack, explained by its most middling ranks", () => {
    const p = personality(middle, 32);
    expect(p.primary.type.key).toBe(FALLBACK.key);
    expect(p.primary.reasons).toHaveLength(3);
  });

  it("top 10 at both ends is built for the playoffs", () => {
    const p = personality({ ...middle, xgf60: 2, xga60: 3 }, 32);
    expect(p.primary.type.key).toBe("playoff");
    expect(p.primary.reasons.map((r) => r.trait).slice(0, 2)).toEqual(["xgf60", "xga60"]);
  });

  it("a match needs every condition, and is stronger nearer the end", () => {
    const run = TYPES.find((t) => t.key === "run-and-gun")!;
    expect(matchScore(run, { ...middle, xgf60: 3 }, 32)).toBe(0);
    expect(matchScore(run, { ...middle, xgf60: 1, xga60: 32 }, 32)).toBeGreaterThan(matchScore(run, { ...middle, xgf60: 9, xga60: 22 }, 32));
  });

  it("outplayed but winning is living dangerously", () => {
    expect(personality({ ...middle, luck: 1, xgfPct: 28 }, 32).primary.type.key).toBe("dangerous");
    expect(personality({ ...middle, luck: 32, xgfPct: 4 }, 32).primary.type.key).toBe("unlucky");
  });
});

// ------------------------------------------------------------------ special teams

describe("special teams", () => {
  it("uses the NHL's power-play counts where it has them", () => {
    const base = { teamId: EDM, gp: 2, ppGoalsFor: 2, ppGoalsAgainst: 1, shGoalsFor: 2, shGoalsAgainst: 0, ppSecondsPerGame: 400, playerGames: 2, drawn: 6, taken: 3, hits: 58, blocks: 29, giveaways: 38, takeaways: 5 };
    const [r] = withReports([base], [{ teamId: EDM, ppOpportunities: 9, powerPlayGoalsFor: 3, shGoalsAgainst: 1 }], null);
    expect(r).toMatchObject({ ppGoalsFor: 3, shGoalsAgainst: 1, ppOpportunities: 9, timesShorthanded: null, ppGoalsAgainst: 1 });
  });
});
