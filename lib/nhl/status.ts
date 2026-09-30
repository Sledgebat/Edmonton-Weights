/** Health of the data layer, for /api/status and the /data page. */
import { cacheStatus, nhlMode, now, NhlError } from "./client";
import { replaySnapshot } from "./replay";
import { resourceForPath } from "./resources";

export type CacheEntry = {
  path: string;
  label: string;
  fetchedAt: number;
  expiresAt: number;
  fresh: boolean;
  failCount: number;
  lastError: string | null;
  lastErrorAt: number | null;
};

export type ReplayStatus = {
  gameId: number;
  elapsed: number;
  duration: number;
  speed: number;
  state: string;
  period: number;
  inIntermission: boolean;
  clock: string;
  home: { abbrev: string; score?: number; sog?: number };
  away: { abbrev: string; score?: number; sog?: number };
  plays: number;
};

export type DataStatus = {
  mode: ReturnType<typeof nhlMode>;
  now: number;
  cache: CacheEntry[];
  replay?: ReplayStatus;
  replayError?: string;
};

export async function dataStatus(): Promise<DataStatus> {
  const mode = nhlMode();
  const t = now();
  const cache = cacheStatus()
    .map((r) => ({
      ...r,
      label: resourceForPath(r.path)?.label ?? "Other",
      fresh: t < r.expiresAt && r.failCount === 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path));

  const status: DataStatus = { mode, now: t, cache };
  if (mode === "replay") {
    try {
      const s = await replaySnapshot();
      status.replay = {
        gameId: s.gameId,
        elapsed: s.elapsed,
        duration: s.duration,
        speed: s.cfg.speed,
        state: s.pbp.gameState,
        period: s.moment.period,
        inIntermission: s.moment.inIntermission,
        clock: s.pbp.clock?.timeRemaining ?? "",
        home: { abbrev: s.pbp.homeTeam.abbrev, score: s.pbp.homeTeam.score, sog: s.pbp.homeTeam.sog },
        away: { abbrev: s.pbp.awayTeam.abbrev, score: s.pbp.awayTeam.score, sog: s.pbp.awayTeam.sog },
        plays: s.pbp.plays.length,
      };
    } catch (err) {
      status.replayError = err instanceof NhlError || err instanceof Error ? err.message : String(err);
    }
  }
  return status;
}
