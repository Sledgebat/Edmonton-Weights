import type { NextRequest } from "next/server";
import { badRequest, isPlayerId, isSeason, serve } from "@/lib/api";
import { nhl } from "@/lib/nhl";

/**
 * GET /api/player/8478402                                   bio, season and career stats
 * GET /api/player/8478402?gameLog=20252026&gameType=2       game log
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/player/[id]">) {
  const { id } = await ctx.params;
  if (!isPlayerId(id)) return badRequest("player id must be 7 digits, e.g. 8478402");

  const season = req.nextUrl.searchParams.get("gameLog");
  if (season === null) return serve(() => nhl.player(Number(id)));
  if (!isSeason(season)) return badRequest("gameLog must be a season like 20252026");
  const gameType = Number(req.nextUrl.searchParams.get("gameType") ?? 2);
  if (gameType !== 2 && gameType !== 3) return badRequest("gameType must be 2 (regular season) or 3 (playoffs)");
  return serve(() => nhl.gameLog(Number(id), Number(season), gameType));
}
