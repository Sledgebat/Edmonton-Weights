/**
 * Data for the league Clutch leaders page and the home page Clutch Score box.
 */
import { load } from "@/lib/load";
import { nhl } from "@/lib/nhl";
import { TEAM_ID } from "@/lib/nhl/endpoints";
import { builtPlayerIds, playerHref } from "@/lib/site";
import { clutchSummary, clutchTable, hasGoalData, type ClutchRow } from "@/lib/stats/clutch";

export type ClutchData = {
  season: number;
  /** False until `npm run update` has stored this season's goals. */
  ready: boolean;
  rows: (ClutchRow & { href: string; ours: boolean; summary: string })[];
};

export async function clutchData(): Promise<ClutchData> {
  const schedule = await load(nhl.schedule);
  const season = schedule.ok ? schedule.data.currentSeason : 20262027;
  const built = await builtPlayerIds();
  const rows = clutchTable(season).map((r) => ({ ...r, href: playerHref(r.playerId, built), ours: r.teamId === TEAM_ID, summary: clutchSummary(r) }));
  return { season, ready: hasGoalData(season), rows };
}
