/**
 * The Standings page's Team stats view: every team's numbers from "Team stats at a glance"
 * (advanced and basic, this season), one row per team, for a sortable table.
 */
import type { Column, TableRow } from "@/components/players/SortableTable";
import { leagueContext } from "@/lib/home";
import { txt, type StandingsRow } from "@/lib/nhl";
import { TEAM } from "@/lib/nhl/endpoints";
import { teamOf } from "@/lib/oilers";

/** Same stats and wording as the home page tiles; `descFirst: false` where lower is better. */
export const TEAM_STAT_COLUMNS: Column[] = [
  { key: "gp", label: "GP", title: "Games played", format: "int" },
  { key: "pts", label: "PTS", title: "Points", format: "int" },
  { key: "xgf", label: "xGF%", title: "Expected goals share at 5 on 5: the best single measure of who's controlling play", format: "pct1" },
  { key: "cf", label: "CF%", title: "Shot attempt share at 5 on 5", format: "pct1" },
  { key: "hdcf", label: "HDCF%", title: "High-danger chance share at 5 on 5", format: "pct1" },
  { key: "pdo", label: "PDO", title: "PDO (luck gauge): 5-on-5 shooting % plus save %; around 100 is normal", format: "pct1" },
  { key: "gsax", label: "GSAx", title: "Goaltending: goals saved above expected", format: "signed1" },
  { key: "gf", label: "GF/G", title: "Goals for per game", format: "dec2" },
  { key: "ga", label: "GA/G", title: "Goals against per game (lower is better)", format: "dec2", descFirst: false },
  { key: "sf", label: "SF/G", title: "Shots on goal for per game", format: "dec2" },
  { key: "sa", label: "SA/G", title: "Shots on goal against per game (lower is better)", format: "dec2", descFirst: false },
  { key: "pp", label: "PP%", title: "Power play: share of power plays that produce a goal", format: "pct1" },
  { key: "pk", label: "PK%", title: "Penalty kill: share of opponent power plays killed", format: "pct1" },
  { key: "fo", label: "FO%", title: "Faceoffs won", format: "pct1" },
  { key: "sv", label: "SV%", title: "Save percentage, all situations (empty-net goals not counted)", format: "sv" },
];

/** One row per team in the standings; stats are null for a team that hasn't played. */
export async function teamStatRows(standings: StandingsRow[], season: number): Promise<TableRow[]> {
  const lg = await leagueContext(season);
  const idOf = new Map(lg.table.map((t) => [t.abbrev, t.teamId]));
  const pct = (v: unknown) => (typeof v === "number" ? v * 100 : null);
  return standings.map((r) => {
    const abbrev = teamOf(r);
    const id = idOf.get(abbrev);
    const m = id !== undefined ? lg.tableById.get(id)?.metrics : undefined;
    const b = id !== undefined ? lg.basicsById.get(id) : undefined;
    const s = id !== undefined ? lg.summaryById.get(id) : undefined;
    return {
      id: abbrev,
      name: txt(r.teamCommonName, abbrev),
      href: `/team/${abbrev}`,
      ours: abbrev === TEAM ? 1 : 0,
      gp: r.gamesPlayed,
      pts: r.points,
      xgf: m?.xgfPct ?? null,
      cf: m?.cfPct ?? null,
      hdcf: m?.hdcfPct ?? null,
      pdo: m?.pdo ?? null,
      gsax: id !== undefined ? (lg.teamGsax.get(id) ?? null) : null,
      gf: b?.gfPg ?? null,
      ga: b?.gaPg ?? null,
      sf: b?.sfPg ?? null,
      sa: b?.saPg ?? null,
      pp: pct(s?.powerPlayPct),
      pk: pct(s?.penaltyKillPct),
      fo: pct(s?.faceoffWinPct),
      sv: id !== undefined ? (lg.teamSvPct.get(id) ?? null) : null,
    };
  });
}
