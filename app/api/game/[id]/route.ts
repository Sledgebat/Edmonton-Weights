import type { NextRequest } from "next/server";
import { badRequest, fail, isGameId, ok } from "@/lib/api";
import { nhl } from "@/lib/nhl";

const PARTS = ["landing", "pbp", "boxscore"] as const;
type Part = (typeof PARTS)[number];

/**
 * Everything a game page needs in one poll.
 * GET /api/game/2026020004?parts=landing,pbp,boxscore   (default: all three)
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/game/[id]">) {
  const { id } = await ctx.params;
  if (!isGameId(id)) return badRequest("game id must be 10 digits, e.g. 2026020004");

  const requested = (req.nextUrl.searchParams.get("parts") ?? PARTS.join(","))
    .split(",")
    .filter((p): p is Part => (PARTS as readonly string[]).includes(p));
  if (requested.length === 0) return badRequest(`parts must be any of ${PARTS.join(", ")}`);

  const gameId = Number(id);
  const loaders: Record<Part, () => Promise<unknown>> = {
    landing: () => nhl.gameLanding(gameId),
    pbp: () => nhl.playByPlay(gameId),
    boxscore: () => nhl.boxscore(gameId),
  };
  try {
    const results = await Promise.all(requested.map((p) => loaders[p]()));
    return ok(Object.fromEntries(requested.map((p, i) => [p, results[i]])));
  } catch (err) {
    return fail(err);
  }
}
