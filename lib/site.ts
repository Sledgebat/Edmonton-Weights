/**
 * Which pages a site build produces. The site is pre-built, so player pages exist only for
 * Oilers players (this season's roster and anyone who played for them this season or last);
 * links to anyone else go to their NHL.com page.
 */
import { load } from "@/lib/load";
import { nhl } from "@/lib/nhl";
import { previousSeason } from "@/lib/nhl/endpoints";

let players: Promise<Set<number>> | undefined;

export function builtPlayerIds(): Promise<Set<number>> {
  players ??= (async () => {
    const [roster, now, schedule] = await Promise.all([load(nhl.roster), load(nhl.clubStats), load(nhl.schedule)]);
    const ids = new Set<number>();
    if (roster.ok) for (const p of [...roster.data.forwards, ...roster.data.defensemen, ...roster.data.goalies]) ids.add(p.id);
    if (now.ok) for (const p of [...now.data.skaters, ...now.data.goalies]) ids.add(p.playerId);
    const season = schedule.ok ? schedule.data.currentSeason : 20262027;
    const last = await load(() => nhl.clubStatsSeason(previousSeason(season)));
    if (last.ok) for (const p of [...last.data.skaters, ...last.data.goalies]) ids.add(p.playerId);
    return ids;
  })();
  return players;
}

/** Our player page when we build one, otherwise the player's page on NHL.com. */
export function playerHref(id: number, built: Set<number>): string {
  return built.has(id) ? `/player/${id}` : `https://www.nhl.com/player/${id}`;
}

/** Every Oilers game this season (preseason included), for game report pages. */
export async function builtGameIds(): Promise<number[]> {
  const schedule = await load(nhl.schedule);
  return schedule.ok ? schedule.data.games.map((g) => g.id) : [];
}
