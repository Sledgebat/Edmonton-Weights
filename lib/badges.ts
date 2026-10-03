/**
 * Badges for one finished game from a team's side, only when they apply: a comeback win (after
 * trailing by 2+) and a stolen game (the goalie saved 2+ goals above expected, and at least the
 * winning margin). Shown on the home page's Last game and in the game report's summary.
 */
import { getDb } from "@/db";
import { goalieGames, isStolen } from "@/lib/stats/goalies";
import { gameScript, scriptGames } from "@/lib/stats/situations";

export type Badge = { kind: "comeback" | "stolen"; text: string };

/** Comeback text from the biggest deficit overcome in a win (2+), else null. */
export function comebackText(maxDeficit: number, won: boolean): string | null {
  return won && maxDeficit <= -2 ? `Came back from ${-maxDeficit} down` : null;
}

/** "Stolen by Jarry, +2.4 GSAx". */
export const stolenText = (lastName: string, gsax: number) => `Stolen by ${lastName}, +${gsax.toFixed(1)} GSAx`;

export function gameBadges(gameId: number, teamId: number, season: number, lastNameOf: (id: number) => string): Badge[] {
  const out: Badge[] = [];
  const game = scriptGames(season).find((g) => g.gameId === gameId);
  if (game && (game.homeId === teamId || game.awayId === teamId)) {
    const s = gameScript(game, teamId);
    const text = comebackText(s.maxDeficit, s.outcome === "W");
    if (text) out.push({ kind: "comeback", text });
  }
  for (const g of goalieGames(season, { teamId }).filter((x) => x.gameId === gameId && isStolen(x))) {
    out.push({ kind: "stolen", text: stolenText(lastNameOf(g.goalieId), g.gsax) });
  }
  return out;
}

/** A goalie's last name from the names stored with each game's goals (falls back to "the goalie"). */
export function storedLastName(playerId: number): string {
  const r = getDb().$client.prepare(`SELECT name FROM player_names WHERE player_id = ?`).get(playerId) as { name: string } | undefined;
  return r ? r.name.split(" ").slice(1).join(" ") || r.name : "the goalie";
}
