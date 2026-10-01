/**
 * NHL EDGE numbers we derive ourselves: per-game speed-burst ranks across the league (the NHL
 * ranks season totals, which favours teams with more games played) and every Oilers skater's
 * individual tracking numbers, so the home page can show the whole roster, not just the leader.
 */
import { getDb } from "@/db";
import { load } from "@/lib/load";
import { nhl, txt, type EdgeTeam, type StandingsRow } from "@/lib/nhl";
import { TEAM } from "@/lib/nhl/endpoints";
import { teamOf } from "@/lib/oilers";
import { rankOf } from "@/lib/rank";

/** Fewer teams than this loaded and we don't show a league rank at all. */
const MIN_TEAMS_FOR_RANK = 10;

/** The latest season an EDGE "now" page covers. */
export function edgeSeasonOf(data: unknown): number | null {
  const list = (data as { seasonsWithEdgeStats?: { id?: number }[] } | null)?.seasonsWithEdgeStats;
  if (!Array.isArray(list)) return null;
  const ids = list.map((s) => s.id).filter((n): n is number => typeof n === "number");
  return ids.length ? Math.max(...ids) : null;
}

/** Team id for every abbreviation we've seen in stored games. */
export function teamIds(): Map<string, number> {
  const rows = getDb()
    .$client.prepare(`SELECT home_abbrev a, home_id id FROM stats_games UNION SELECT away_abbrev, away_id FROM stats_games`)
    .all() as { a: string; id: number }[];
  return new Map(rows.map((r) => [r.a, r.id]));
}

export type PerGame = { value: number | null; rank: number | null; of: number };
export type BurstTable = { over20: Map<string, PerGame>; over22: Map<string, PerGame>; teams: number };

/**
 * Speed bursts (any player over 20 or 22 mph) per game for every team this season, ranked by
 * us. Teams whose EDGE page still shows last season, or that haven't played, are left out.
 */
export async function burstTable(standings: StandingsRow[], season: number): Promise<BurstTable> {
  const ids = teamIds();
  const teams = standings.filter((r) => r.gamesPlayed > 0).map((r) => ({ abbrev: teamOf(r), gp: r.gamesPlayed, id: ids.get(teamOf(r)) }));
  const loaded = await Promise.all(
    teams.map(async (t) => {
      if (!t.id) return null;
      const e = await load(() => nhl.edgeTeam(t.id!));
      if (!e.ok || edgeSeasonOf(e.data) !== season) return null;
      const s = (e.data as EdgeTeam).skatingSpeed;
      const per = (v: unknown) => (typeof v === "number" ? v / t.gp : null);
      return { abbrev: t.abbrev, over20: per(s?.burstsOver20?.value), over22: per(s?.burstsOver22?.value) };
    }),
  );
  const ok = loaded.filter((x): x is NonNullable<typeof x> => x !== null);
  const rank = (key: "over20" | "over22") => {
    const values = ok.map((t) => t[key]).filter((v): v is number => v !== null);
    const show = values.length >= MIN_TEAMS_FOR_RANK;
    return new Map(
      ok.map((t) => [t.abbrev, { value: t[key], rank: show && t[key] !== null ? rankOf(t[key] as number, values, true) : null, of: values.length }]),
    );
  };
  return { over20: rank("over20"), over22: rank("over22"), teams: ok.length };
}

export type SkaterEdgeRow = {
  id: number;
  name: string;
  pos: string;
  speedMax: number | null;
  topShot: number | null;
  bursts20: number | null;
};

/** Every Oilers skater's EDGE numbers for this season (players who haven't played are left out). */
export async function rosterEdge(season: number): Promise<SkaterEdgeRow[]> {
  const roster = await load(() => nhl.roster(TEAM));
  if (!roster.ok) return [];
  const skaters = [...roster.data.forwards, ...roster.data.defensemen];
  const rows = await Promise.all(
    skaters.map(async (p) => {
      const e = await load(() => nhl.edgeSkater(p.id));
      if (!e.ok || edgeSeasonOf(e.data) !== season) return null;
      const d = e.data;
      const num = (v: unknown) => (typeof v === "number" ? v : null);
      return {
        id: p.id,
        name: `${txt(p.firstName)} ${txt(p.lastName)}`,
        pos: p.positionCode,
        speedMax: num(d.skatingSpeed?.speedMax?.imperial),
        topShot: num(d.topShotSpeed?.imperial),
        bursts20: num(d.skatingSpeed?.burstsOver20?.value),
      };
    }),
  );
  return rows.filter((r): r is SkaterEdgeRow => r !== null);
}
