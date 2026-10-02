/**
 * The Players page's Lines tab: the Oilers' forward lines and defence pairs, from who was
 * actually on the ice together at 5 on 5 (NHL shift charts). This season only.
 */
import { playerName } from "@/lib/home";
import { load } from "@/lib/load";
import { nhl, txt, type ClubStats } from "@/lib/nhl";
import { TEAM_ID } from "@/lib/nhl/endpoints";
import { MIN_UNIT_SECONDS, currentLines, unitTable, type Unit } from "@/lib/stats/onice";

export type NamedUnit = Unit & { names: string[]; ids: number[] };

export type LinesData = {
  season: number;
  current: { gameId: number; date: string; opponent: string; lines: NamedUnit[]; pairs: NamedUnit[] } | null;
  lines: NamedUnit[];
  pairs: NamedUnit[];
  minMinutes: number;
};

/** Left wing, centre, right wing reads like a line chart; anyone else after. */
const ORDER: Record<string, number> = { L: 0, C: 1, R: 2, D: 3 };

/** Names for a set of units, players in L–C–R order. */
export async function nameUnits(units: Unit[], cs?: ClubStats): Promise<NamedUnit[]> {
  const pos = new Map((cs?.skaters ?? []).map((s) => [s.playerId, s.positionCode]));
  const last = new Map<number, string>();
  for (const s of cs?.skaters ?? []) last.set(s.playerId, txt(s.lastName));
  const nameOf = async (id: number) => last.get(id) ?? (await playerName(id, cs)).split(" ").slice(1).join(" ");
  return Promise.all(
    units.map(async (u) => {
      const ids = [...u.players].sort((a, b) => (ORDER[pos.get(a) ?? ""] ?? 4) - (ORDER[pos.get(b) ?? ""] ?? 4));
      return { ...u, ids, names: await Promise.all(ids.map(nameOf)) };
    }),
  );
}

export async function linesData(season: number): Promise<LinesData> {
  const stats = await load(nhl.clubStats);
  const cs = stats.ok ? stats.data : undefined;
  const all = unitTable(TEAM_ID, season);
  const cur = currentLines(TEAM_ID, season);
  return {
    season,
    current: cur ? { ...cur, lines: await nameUnits(cur.lines, cs), pairs: await nameUnits(cur.pairs, cs) } : null,
    lines: await nameUnits(all.filter((u) => u.kind === "F"), cs),
    pairs: await nameUnits(all.filter((u) => u.kind === "D"), cs),
    minMinutes: MIN_UNIT_SECONDS / 60,
  };
}
