import type { NextRequest } from "next/server";
import { badRequest, isSeason, serve } from "@/lib/api";
import { nhl } from "@/lib/nhl";

/** GET /api/schedule            current Oilers season
 *  GET /api/schedule?season=19831984 */
export function GET(req: NextRequest) {
  const season = req.nextUrl.searchParams.get("season");
  if (season === null) return serve(() => nhl.schedule());
  if (!isSeason(season)) return badRequest("season must look like 20262027");
  return serve(() => nhl.scheduleSeason(Number(season)));
}
