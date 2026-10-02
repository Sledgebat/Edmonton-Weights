/**
 * Clutch Score: a just-for-fun stat for late, big goals. Nobody can really measure "clutch", so
 * this keeps it simple and transparent:
 *
 *   Clutch time = the last 10 minutes of the third period, or overtime, with the scoring team
 *   behind by one, tied, or ahead by one just before the goal.
 *
 *   Overtime winner                         3
 *   Tying goal                              2   (2.5 with their own goalie pulled)
 *   Go-ahead goal (from a tie)              2
 *   Insurance goal (from up 1 to up 2)      0.5 (0 into an empty net)
 *
 *   The primary assist gets 70% of the goal's value, the secondary assist 50%.
 *   Playoff goals count 1.5 times.
 *
 * Goals are stored with the score before them (`goals` table); the score is worked out here at
 * build time, so changing a weight needs no new downloads.
 */
import { getDb } from "@/db";
import { txt, type PlayByPlay } from "@/lib/nhl/schemas";
import { situation, toSec } from "./extract";

export const CLUTCH = {
  otWinner: 3,
  tying: 2,
  tyingGoaliePulled: 2.5,
  goAhead: 2,
  insurance: 0.5,
  a1Share: 0.7,
  a2Share: 0.5,
  playoffs: 1.5,
  /** Clutch time in the third starts this many seconds into the period (the last 10 minutes). */
  thirdFrom: 600,
} as const;

export type ClutchKind = "ot" | "tying" | "goAhead" | "insurance";

export const CLUTCH_LABEL: Record<ClutchKind, { one: string; many: string }> = {
  ot: { one: "OT winner", many: "OT winners" },
  tying: { one: "late equalizer", many: "late equalizers" },
  goAhead: { one: "late go-ahead goal", many: "late go-ahead goals" },
  insurance: { one: "insurance goal", many: "insurance goals" },
};

export type GoalEvent = {
  gameId: number;
  eventId: number;
  season: number;
  gameType: number;
  period: number;
  periodType: "REG" | "OT";
  periodSeconds: number;
  teamId: number;
  oppTeamId: number;
  scorerId: number | null;
  a1Id: number | null;
  a2Id: number | null;
  ownBefore: number;
  oppBefore: number;
  ownGoalieIn: boolean;
  oppGoalieIn: boolean;
};

/** Every goal in a game except shootout goals, in order, with the score just before each. */
export function extractGoals(pbp: PlayByPlay): GoalEvent[] {
  const homeId = pbp.homeTeam.id;
  const awayId = pbp.awayTeam.id;
  const score = new Map([
    [homeId, 0],
    [awayId, 0],
  ]);
  const out: GoalEvent[] = [];
  const plays = [...pbp.plays].filter((p) => p.periodDescriptor.periodType !== "SO" && p.typeDescKey === "goal").sort((a, b) => a.sortOrder - b.sortOrder);
  for (const p of plays) {
    const d = p.details;
    const teamId = d?.eventOwnerTeamId;
    if (!d || (teamId !== homeId && teamId !== awayId)) continue;
    const isHome = teamId === homeId;
    const oppTeamId = isHome ? awayId : homeId;
    const sit = situation(p.situationCode, isHome);
    out.push({
      gameId: pbp.id,
      eventId: p.eventId,
      season: pbp.season,
      gameType: pbp.gameType,
      period: p.periodDescriptor.number,
      periodType: p.periodDescriptor.periodType === "OT" || p.periodDescriptor.number > 3 ? "OT" : "REG",
      periodSeconds: toSec(p.timeInPeriod),
      teamId,
      oppTeamId,
      scorerId: d.scoringPlayerId ?? null,
      a1Id: d.assist1PlayerId ?? null,
      a2Id: d.assist2PlayerId ?? null,
      ownBefore: score.get(teamId)!,
      oppBefore: score.get(oppTeamId)!,
      ownGoalieIn: sit.ownGoalieIn,
      oppGoalieIn: sit.oppGoalieIn,
    });
    score.set(teamId, score.get(teamId)! + 1);
  }
  return out;
}

type ScoredGoal = Pick<GoalEvent, "period" | "periodType" | "periodSeconds" | "ownBefore" | "oppBefore" | "ownGoalieIn" | "oppGoalieIn" | "gameType">;

/** What kind of clutch goal this was, or null if it wasn't one. */
export function clutchKind(g: ScoredGoal): ClutchKind | null {
  const diff = g.ownBefore - g.oppBefore;
  if (g.periodType === "OT") return diff === 0 ? "ot" : null;
  if (g.period !== 3 || g.periodSeconds < CLUTCH.thirdFrom) return null;
  if (diff === -1) return "tying";
  if (diff === 0) return "goAhead";
  if (diff === 1) return "insurance";
  return null;
}

/** The goal scorer's clutch points for one goal (0 if it wasn't clutch). */
export function clutchValue(g: ScoredGoal): number {
  const kind = clutchKind(g);
  if (!kind) return 0;
  const base =
    kind === "ot"
      ? CLUTCH.otWinner
      : kind === "tying"
        ? g.ownGoalieIn
          ? CLUTCH.tying
          : CLUTCH.tyingGoaliePulled
        : kind === "goAhead"
          ? CLUTCH.goAhead
          : g.oppGoalieIn
            ? CLUTCH.insurance
            : 0;
  return base * (g.gameType === 3 ? CLUTCH.playoffs : 1);
}

export type ClutchRow = {
  playerId: number;
  name: string;
  /** C, L, R, D or G. */
  pos: string;
  teamId: number;
  team: string;
  score: number;
  goals: number;
  assists: number;
  ot: number;
  tying: number;
  goAhead: number;
  insurance: number;
  /** League rank by Clutch Score (ties share a rank). */
  rank: number;
};

/** Every player with any clutch points in a season (regular season and playoffs), best first. */
export function clutchTable(season: number): ClutchRow[] {
  const db = getDb().$client;
  const rows = db
    .prepare(
      `SELECT period, period_type periodType, period_seconds periodSeconds, team_id teamId, scorer_id scorerId, a1_id a1Id, a2_id a2Id,
              own_before ownBefore, opp_before oppBefore, own_goalie_in ownGoalieIn, opp_goalie_in oppGoalieIn, game_type gameType
         FROM goals
        WHERE season = ? AND game_type IN (2, 3)
          AND ((period = 3 AND period_seconds >= ?) OR period_type = 'OT')
          AND own_before - opp_before BETWEEN -1 AND 1`,
    )
    .all(season, CLUTCH.thirdFrom) as (Omit<ScoredGoal, "ownGoalieIn" | "oppGoalieIn" | "periodType"> & {
    periodType: "REG" | "OT";
    ownGoalieIn: number;
    oppGoalieIn: number;
    teamId: number;
    scorerId: number | null;
    a1Id: number | null;
    a2Id: number | null;
  })[];

  const acc = new Map<number, Omit<ClutchRow, "name" | "pos" | "team" | "rank">>();
  const credit = (id: number | null, teamId: number, points: number, kind: ClutchKind, scorer: boolean) => {
    if (id === null) return;
    const r = acc.get(id) ?? { playerId: id, teamId, score: 0, goals: 0, assists: 0, ot: 0, tying: 0, goAhead: 0, insurance: 0 };
    r.score += points;
    if (scorer) {
      r.goals++;
      r[kind]++;
    } else r.assists++;
    acc.set(id, r);
  };
  for (const raw of rows) {
    const g = { ...raw, ownGoalieIn: !!raw.ownGoalieIn, oppGoalieIn: !!raw.oppGoalieIn };
    const kind = clutchKind(g);
    const value = clutchValue(g);
    if (!kind || value <= 0) continue;
    credit(g.scorerId, g.teamId, value, kind, true);
    credit(g.a1Id, g.teamId, value * CLUTCH.a1Share, kind, false);
    credit(g.a2Id, g.teamId, value * CLUTCH.a2Share, kind, false);
  }
  if (acc.size === 0) return [];

  const names = new Map(
    (db.prepare(`SELECT player_id playerId, name, pos, team_id teamId FROM player_names`).all() as { playerId: number; name: string; pos: string; teamId: number }[]).map(
      (n) => [n.playerId, n],
    ),
  );
  const abbrevs = new Map(
    (db.prepare(`SELECT home_id id, home_abbrev abbrev FROM stats_games UNION SELECT away_id, away_abbrev FROM stats_games`).all() as { id: number; abbrev: string }[]).map((t) => [t.id, t.abbrev]),
  );
  // Float sums like 0.7 + 1.4 drift; round so equal scores tie and sort cleanly.
  const out = [...acc.values()]
    .map((r) => {
      const n = names.get(r.playerId);
      const teamId = n?.teamId ?? r.teamId;
      return { ...r, score: Math.round(r.score * 100) / 100, name: n?.name ?? `Player ${r.playerId}`, pos: n?.pos ?? "", teamId, team: abbrevs.get(teamId) ?? "", rank: 0 };
    })
    .sort((a, b) => b.score - a.score || b.goals - a.goals || b.ot - a.ot || a.name.localeCompare(b.name));
  out.forEach((r, i) => (r.rank = i > 0 && out[i - 1].score === r.score ? out[i - 1].rank : i + 1));
  return out;
}

/** Whether any of this season's goals have been stored yet (they arrive with `npm run update`). */
export function hasGoalData(season: number): boolean {
  return !!getDb().$client.prepare(`SELECT 1 FROM goal_status s JOIN stats_games g ON g.id = s.game_id WHERE g.season = ? LIMIT 1`).get(season);
}

/** "2 OT winners, 1 late equalizer, 3 assists": the reasons behind a player's score. */
export function clutchSummary(r: Pick<ClutchRow, ClutchKind | "assists">): string {
  const parts = (["ot", "tying", "goAhead", "insurance"] as const).filter((k) => r[k] > 0).map((k) => `${r[k]} ${r[k] === 1 ? CLUTCH_LABEL[k].one : CLUTCH_LABEL[k].many}`);
  if (r.assists > 0) parts.push(`${r.assists} clutch ${r.assists === 1 ? "assist" : "assists"}`);
  return parts.join(", ");
}

/** Lineup names for `player_names`. */
export function rosterNames(pbp: PlayByPlay) {
  return pbp.rosterSpots.map((r) => ({
    playerId: r.playerId,
    name: `${txt(r.firstName)} ${txt(r.lastName)}`.trim(),
    pos: r.positionCode,
    teamId: r.teamId,
    lastGameDate: pbp.gameDate,
  }));
}
