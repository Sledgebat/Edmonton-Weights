"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReplayStatus } from "@/lib/nhl/status";

const POLL_MS = 2_000;

/** Polls /api/replay and shows the replayed game ticking along, without a page reload. */
export function ReplayMonitor({ initial }: { initial: ReplayStatus | null }) {
  const [status, setStatus] = useState<ReplayStatus | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [polledAt, setPolledAt] = useState<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/replay", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
      setStatus(body.replay);
      setError(null);
      setPolledAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  async function restart() {
    await fetch("/api/replay", { method: "POST" });
    await poll();
  }

  if (!status) return <p className="text-loss">{error ?? "Replay not available."}</p>;

  const pct = Math.min(100, (status.elapsed / status.duration) * 100);
  const periodLabel = status.period <= 3 ? `P${status.period}` : status.period === 4 ? "OT" : status.period === 5 ? "SO" : `OT${status.period - 3}`;
  const stateLabel =
    status.state === "PRE"
      ? "Pre-game"
      : status.state === "FINAL"
        ? "Final"
        : status.inIntermission
          ? `End of ${periodLabel}`
          : `${periodLabel} · ${status.clock}`;

  return (
    <div className="card overflow-hidden" aria-live="polite">
      <div className="flex items-center justify-between gap-3 bg-header px-4 py-2 text-header-fg">
        <span className="numeral text-sm uppercase tracking-widest">
          {status.state === "LIVE" || status.state === "CRIT" ? (
            <span className="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-loss align-middle" aria-hidden />
          ) : null}
          {stateLabel}
        </span>
        <span className="text-xs opacity-85">
          Game {status.gameId} · {status.speed}x
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-5 text-center">
        <div>
          <p className="display text-2xl">{status.away.abbrev}</p>
          <p className="text-xs text-fg-muted">Away · {status.away.sog ?? 0} SOG</p>
        </div>
        <p className="numeral text-6xl leading-none">
          {status.away.score ?? 0}
          <span className="mx-2 text-fg-muted">–</span>
          {status.home.score ?? 0}
        </p>
        <div>
          <p className="display text-2xl">{status.home.abbrev}</p>
          <p className="text-xs text-fg-muted">Home · {status.home.sog ?? 0} SOG</p>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Replay progress">
          <div className="h-full bg-button transition-[width] duration-1000" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
          <span>
            {status.plays} plays so far · {Math.floor(status.elapsed / 60)}:{String(Math.floor(status.elapsed % 60)).padStart(2, "0")} of{" "}
            {Math.floor(status.duration / 60)}:{String(Math.floor(status.duration % 60)).padStart(2, "0")}
            {polledAt ? " · refreshing every 2 s" : ""}
          </span>
          <button type="button" onClick={restart} className="btn btn-secondary min-h-9 px-3 py-1 text-xs">
            <RotateCcw size={14} aria-hidden /> Restart replay
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-loss">Last poll failed: {error}</p>}
      </div>
    </div>
  );
}
