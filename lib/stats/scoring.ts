/**
 * How a team scores: its goals and expected goals split by where the chance came from (rush,
 * rebound, everything else), by shot type, and by strength, next to the league average split.
 * Regular season, shots at an empty net left out.
 */
import { getDb } from "@/db";
import { rankOf } from "@/lib/rank";

export type Split = { key: string; label: string; goals: number; xg: number; goalShare: number; xgShare: number; leagueGoalShare: number; leagueXgShare: number };
export type ScoringProfile = {
  goals: number;
  xg: number;
  origin: Split[];
  shotType: Split[];
  strength: Split[];
  /** Rebound expected goals per 60 minutes (all situations) with a league rank. */
  reboundXg60: { value: number; rank: number; of: number };
};

const ORIGINS = [
  { key: "rush", label: "Off the rush" },
  { key: "rebound", label: "Rebounds" },
  { key: "other", label: "Everything else" },
];
const SHOT_TYPES = [
  { key: "wrist", label: "Wrist" },
  { key: "snap", label: "Snap" },
  { key: "slap", label: "Slap" },
  { key: "tip", label: "Tips and deflections" },
  { key: "backhand", label: "Backhand" },
  { key: "other", label: "Other (wraparounds, bats...)" },
];
const STRENGTHS = [
  { key: "5v5", label: "5 on 5" },
  { key: "PP", label: "Power play" },
  { key: "SH", label: "Shorthanded" },
  { key: "other", label: "Other (4 on 4, 3 on 3, extra attacker)" },
];

const shotTypeOf = (t: string | null) =>
  t === "wrist" || t === "snap" || t === "slap" || t === "backhand" ? t : t === "tip-in" || t === "deflected" ? "tip" : "other";
const strengthOf = (s: string) => (s === "5v5" || s === "PP" || s === "SH" ? s : "other");

type Row = { t: number; origin: string; shotType: string; strength: string; goals: number; xg: number };

/** Goals and xG per team by origin, shot type and strength (one grouped query). */
function rows(season: number, gameType: number): Row[] {
  const raw = getDb()
    .$client.prepare(
      `SELECT team_id t, CASE WHEN rush = 1 THEN 'rush' WHEN rebound = 1 THEN 'rebound' ELSE 'other' END origin,
         shot_type st, strength, SUM(is_goal) goals, SUM(xg) xg
       FROM shots WHERE season = ? AND game_type = ? AND type != 'blocked-shot' AND strength != 'EN'
       GROUP BY team_id, origin, st, strength`,
    )
    .all(season, gameType) as { t: number; origin: string; st: string | null; strength: string; goals: number; xg: number }[];
  return raw.map((r) => ({ t: r.t, origin: r.origin, shotType: shotTypeOf(r.st), strength: strengthOf(r.strength), goals: r.goals, xg: r.xg }));
}

function splits(own: Row[], league: Row[], defs: { key: string; label: string }[], pick: (r: Row) => string): Split[] {
  const total = (rs: Row[], k: "goals" | "xg") => rs.reduce((s, r) => s + r[k], 0);
  const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
  const [og, ox, lg, lx] = [total(own, "goals"), total(own, "xg"), total(league, "goals"), total(league, "xg")];
  return defs.map((d) => {
    const o = own.filter((r) => pick(r) === d.key);
    const l = league.filter((r) => pick(r) === d.key);
    return {
      ...d,
      goals: total(o, "goals"),
      xg: total(o, "xg"),
      goalShare: share(total(o, "goals"), og),
      xgShare: share(total(o, "xg"), ox),
      leagueGoalShare: share(total(l, "goals"), lg),
      leagueXgShare: share(total(l, "xg"), lx),
    };
  });
}

const cache = new Map<number, { at: number; rows: Row[]; toi: Map<number, number> }>();

function load(season: number, gameType = 2) {
  const hit = cache.get(season);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit;
  const toi = new Map(
    (
      getDb()
        .$client.prepare(
          `SELECT st.team_id t, SUM(st.seconds) s FROM strength_time st JOIN stats_games g ON g.id = st.game_id
           WHERE g.season = ? AND g.game_type = ? GROUP BY st.team_id`,
        )
        .all(season, gameType) as { t: number; s: number }[]
    ).map((r) => [r.t, r.s]),
  );
  const value = { at: Date.now(), rows: rows(season, gameType), toi };
  cache.set(season, value);
  return value;
}

/** A team's scoring profile against the league, or null before it has any shots. */
export function scoringProfile(teamId: number, season: number): ScoringProfile | null {
  const { rows: all, toi } = load(season);
  const own = all.filter((r) => r.t === teamId);
  if (!own.length) return null;
  const per60 = (t: number, origin: string) => {
    const sec = toi.get(t) ?? 0;
    return sec ? (all.filter((r) => r.t === t && r.origin === origin).reduce((s, r) => s + r.xg, 0) * 3600) / sec : 0;
  };
  const teams = [...toi.keys()];
  const ranked = (origin: string) => {
    const values = teams.map((t) => per60(t, origin));
    const value = per60(teamId, origin);
    return { value, rank: rankOf(value, values, true), of: values.length };
  };
  return {
    goals: own.reduce((s, r) => s + r.goals, 0),
    xg: own.reduce((s, r) => s + r.xg, 0),
    origin: splits(own, all, ORIGINS, (r) => r.origin),
    shotType: splits(own, all, SHOT_TYPES, (r) => r.shotType),
    strength: splits(own, all, STRENGTHS, (r) => r.strength),
    reboundXg60: ranked("rebound"),
  };
}
