/**
 * Luck meter: points earned vs points "deserved" from the chances in each game.
 *
 * Every unblocked shot in regulation is a coin flip that lands as a goal with probability equal
 * to its expected goals. Adding those flips up shot by shot gives the exact chance of every
 * score for each team (no simulation), and from that the chance of winning in regulation, going
 * to overtime tied, or losing. Deserved points = 2 × P(win) + 1.5 × P(tie), since a tied game
 * hands out 1 point each plus a coin-flip extra point. Empty-net shots are left out, and so is
 * overtime. It ignores score effects (a team protecting a lead gives up more chances than usual).
 *
 * Real games end regulation tied more often than independent shots suggest (score effects again:
 * 21% of games in 2024-25 and 25% in 2025-26, against 16–17% from the shots). So every game's tie
 * chance is scaled up by the season's actual-to-expected tie ratio, leaning on the two-season
 * ratio while the season is young, which keeps the league's luck adding up to about zero.
 */
import { getDb } from "@/db";
import { rankOf } from "@/lib/rank";

/** The chance of scoring exactly 0, 1, 2, ... goals from shots with these probabilities. */
export function goalDistribution(xgs: number[]): number[] {
  let dist = [1];
  for (const p of xgs) {
    const q = Math.min(1, Math.max(0, p));
    const next = Array<number>(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - q);
      next[k + 1] += dist[k] * q;
    }
    dist = next;
  }
  return dist;
}

/** Regulation win, tie and loss chances for the team with `own` shots against the `opp` shots. */
export function outcomeChances(own: number[], opp: number[]): { win: number; tie: number; loss: number } {
  const a = goalDistribution(own);
  const b = goalDistribution(opp);
  let win = 0;
  let tie = 0;
  // Cumulative chance the opponent scores fewer than k.
  let below = 0;
  for (let k = 0; k < a.length; k++) {
    tie += a[k] * (b[k] ?? 0);
    win += a[k] * below;
    below += b[k] ?? 0;
  }
  return { win, tie, loss: Math.max(0, 1 - win - tie) };
}

export const deservedPoints = (c: { win: number; tie: number }) => 2 * c.win + 1.5 * c.tie;

/** Actual ties per expected tie over 2024-25 and 2025-26, and how much weight (in expected ties) it gets. */
export const TIE_RATIO_PRIOR = 1.37;
const TIE_PRIOR_WEIGHT = 20;

/** The season's tie ratio, pulled toward the prior while the season is young. */
export function tieRatio(actualTies: number, expectedTies: number): number {
  return (actualTies + TIE_RATIO_PRIOR * TIE_PRIOR_WEIGHT) / (expectedTies + TIE_PRIOR_WEIGHT);
}

/** Scale a game's tie chance by `ratio`, taking the extra from win and loss in proportion. */
export function adjustTies(c: { win: number; tie: number; loss: number }, ratio: number): { win: number; tie: number; loss: number } {
  const tie = Math.min(0.95, c.tie * ratio);
  const rest = 1 - c.tie;
  const scale = rest > 0 ? (1 - tie) / rest : 0;
  return { win: c.win * scale, tie, loss: c.loss * scale };
}

export type LuckGame = { gameId: number; date: string; opponent: string; actual: number; deserved: number };
export type TeamLuck = { teamId: number; games: LuckGame[]; actual: number; deserved: number; diff: number };

/** Every team's game-by-game actual and deserved points for a season (regular season). */
export function luckTable(season: number, gameType = 2): Map<number, TeamLuck> {
  const db = getDb().$client;
  const games = db
    .prepare(
      `SELECT id, game_date date, home_id homeId, away_id awayId, home_abbrev homeAbbrev, away_abbrev awayAbbrev,
         home_score homeScore, away_score awayScore, last_period_type lpt
       FROM stats_games WHERE season = ? AND game_type = ? ORDER BY game_date, id`,
    )
    .all(season, gameType) as { id: number; date: string; homeId: number; awayId: number; homeAbbrev: string; awayAbbrev: string; homeScore: number; awayScore: number; lpt: string }[];
  const shots = db
    .prepare(
      `SELECT game_id g, team_id t, xg FROM shots
       WHERE season = ? AND game_type = ? AND type != 'blocked-shot' AND strength != 'EN' AND period <= 3`,
    )
    .all(season, gameType) as { g: number; t: number; xg: number }[];
  const byGame = new Map<number, { t: number; xg: number }[]>();
  for (const s of shots) {
    const list = byGame.get(s.g) ?? [];
    list.push(s);
    byGame.set(s.g, list);
  }
  const out = new Map<number, TeamLuck>();
  const push = (teamId: number, g: LuckGame) => {
    const t = out.get(teamId) ?? { teamId, games: [], actual: 0, deserved: 0, diff: 0 };
    t.games.push(g);
    t.actual += g.actual;
    t.deserved += g.deserved;
    t.diff = t.actual - t.deserved;
    out.set(teamId, t);
  };
  const chances = games.map((g) => {
    const list = byGame.get(g.id) ?? [];
    return outcomeChances(
      list.filter((s) => s.t === g.homeId).map((s) => s.xg),
      list.filter((s) => s.t === g.awayId).map((s) => s.xg),
    );
  });
  const ratio = tieRatio(
    games.filter((g) => g.lpt !== "REG").length,
    chances.reduce((s, c) => s + c.tie, 0),
  );
  games.forEach((g, i) => {
    const c = adjustTies(chances[i], ratio);
    const extra = g.lpt === "OT" || g.lpt === "SO";
    const pts = (gf: number, ga: number) => (gf > ga ? 2 : extra ? 1 : 0);
    push(g.homeId, { gameId: g.id, date: g.date, opponent: g.awayAbbrev, actual: pts(g.homeScore, g.awayScore), deserved: deservedPoints(c) });
    push(g.awayId, { gameId: g.id, date: g.date, opponent: g.homeAbbrev, actual: pts(g.awayScore, g.homeScore), deserved: deservedPoints({ win: c.loss, tie: c.tie }) });
  });
  return out;
}

const cache = new Map<number, { at: number; value: Map<number, TeamLuck> }>();

/** The luck table, shared for a few minutes across the team pages. */
export function leagueLuck(season: number): Map<number, TeamLuck> {
  const hit = cache.get(season);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const value = luckTable(season);
  cache.set(season, { at: Date.now(), value });
  return value;
}

/** Rank 1 = luckiest (most points above deserved). */
export function luckRank(all: Map<number, TeamLuck>, teamId: number): { rank: number | null; of: number } {
  const t = all.get(teamId);
  const values = [...all.values()].map((x) => x.diff);
  return { rank: t ? rankOf(t.diff, values, true) : null, of: values.length };
}

/** Gauge needle range: points above or below deserved are clipped to ±10. */
export const LUCK_CLIP = 10;

/**
 * One sentence on luck and where it's heading, e.g. "3 points worse than they deserved, and
 * shooting 6.8% at 5 on 5. Should improve." `pdo` is 5-on-5 shooting % + save % (100 = normal).
 */
export function luckVerdict(diff: number, sh5: number, sv5: number, pdo: number): string {
  const n = Math.round(Math.abs(diff));
  const pts = `${n} ${n === 1 ? "point" : "points"}`;
  const gap = n === 0 ? "Right about where their play says they should be" : diff > 0 ? `${pts} better than they deserved` : `${pts} worse than they deserved`;
  const shooting = `shooting ${sh5.toFixed(1)}% at 5 on 5 with a ${(sv5 * 100).toFixed(1)}% save rate`;
  // Low PDO (cold shooting or goaltending) tends to recover; high PDO tends to fade.
  const outlook = pdo < 98.5 || (pdo <= 101.5 && diff <= -3) ? " Should improve." : pdo > 101.5 || diff >= 3 ? " Hard to keep up." : "";
  return `${gap}, ${shooting}.${outlook}`;
}
