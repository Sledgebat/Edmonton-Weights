/**
 * League-wide numbers behind the Season In-Depth page (/team/[abbrev]) that every team is
 * measured against: personality ranks, luck, special teams. Built once per season and shared
 * by all 32 pages for a few minutes.
 */
import { leagueContext, type LeagueContext } from "@/lib/home";
import { load } from "@/lib/load";
import { nhl } from "@/lib/nhl";
import { rankOf } from "@/lib/rank";
import { leagueLuck, type TeamLuck } from "@/lib/stats/luck";
import type { Trait, TraitRanks } from "@/lib/stats/personality";
import { specialRank, specialRows, withReports, type SpecialRow } from "@/lib/stats/special";

export type InDepthLeague = {
  lg: LeagueContext;
  luck: Map<number, TeamLuck>;
  special: SpecialRow[];
  traits: Map<number, TraitRanks>;
  /** Teams the traits are ranked among. */
  of: number;
};

/** Each team's league rank (1 = best; luck 1 = luckiest) in everything the personality rules use. */
export function traitRanks(lg: LeagueContext, luck: Map<number, TeamLuck>, special: SpecialRow[]): { traits: Map<number, TraitRanks>; of: number } {
  const teams = lg.table;
  const summary = (id: number, k: "powerPlayPct" | "penaltyKillPct") => {
    const v = lg.summaryById.get(id)?.[k];
    return typeof v === "number" ? v : null;
  };
  const series: Record<Trait, (id: number) => number | null> = {
    xgf60: (id) => lg.tableById.get(id)?.metrics.xgf60 ?? null,
    xga60: (id) => lg.tableById.get(id)?.metrics.xga60 ?? null,
    xgfPct: (id) => lg.tableById.get(id)?.metrics.xgfPct ?? null,
    cfPct: (id) => lg.tableById.get(id)?.metrics.cfPct ?? null,
    hdcfPct: (id) => lg.tableById.get(id)?.metrics.hdcfPct ?? null,
    gsax: (id) => lg.teamGsax.get(id) ?? null,
    pdo: (id) => lg.tableById.get(id)?.metrics.pdo ?? null,
    pp: (id) => summary(id, "powerPlayPct"),
    pk: (id) => summary(id, "penaltyKillPct"),
    luck: (id) => luck.get(id)?.diff ?? null,
    penalties: (id) => specialRank(special, id, "penaltyDiff").value,
  };
  const lowerIsBetter = new Set<Trait>(["xga60"]);
  const traits = new Map<number, TraitRanks>(teams.map((t) => [t.teamId, {}]));
  for (const k of Object.keys(series) as Trait[]) {
    const values = teams.map((t) => series[k](t.teamId)).filter((v): v is number => v !== null);
    for (const t of teams) {
      const v = series[k](t.teamId);
      if (v !== null && values.length === teams.length) traits.get(t.teamId)![k] = rankOf(v, values, !lowerIsBetter.has(k));
    }
  }
  return { traits, of: teams.length };
}

const cache = new Map<number, { at: number; value: Promise<InDepthLeague> }>();

export function inDepthLeague(season: number): Promise<InDepthLeague> {
  const hit = cache.get(season);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const value = (async () => {
    const [lg, pp, pk] = await Promise.all([leagueContext(season), load(() => nhl.teamPowerPlay(season)), load(() => nhl.teamPenaltyKill(season))]);
    const luck = leagueLuck(season);
    const special = withReports(specialRows(season), pp.ok ? pp.data.data : null, pk.ok ? pk.data.data : null);
    return { lg, luck, special, ...traitRanks(lg, luck, special) };
  })();
  cache.set(season, { at: Date.now(), value });
  return value;
}
