import type { NextRequest } from "next/server";
import { badRequest, fail, isSeason, ok } from "@/lib/api";
import { nhl } from "@/lib/nhl";
import { goalieTable, leagueAverages, leagueTable } from "@/lib/stats/team";
import { currentModel } from "@/lib/stats/xg";

/**
 * League table of advanced stats with ranks (1 = best), league averages and goalie GSAx.
 * GET /api/stats/teams            this season
 * GET /api/stats/teams?season=20252026
 */
export async function GET(req: NextRequest) {
  try {
    const param = req.nextUrl.searchParams.get("season");
    if (param !== null && !isSeason(param)) return badRequest("season must look like 20262027");
    const season = param ? Number(param) : (await nhl.schedule()).data.currentSeason;
    const teams = leagueTable(season);
    const m = currentModel();
    return ok({
      season,
      teams,
      averages: leagueAverages(teams),
      goalies: goalieTable(season),
      model: { version: m.version, provisional: m.provisional },
    });
  } catch (err) {
    return fail(err);
  }
}
