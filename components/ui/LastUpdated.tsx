"use client";

import { useEffect, useState } from "react";

function relative(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const absolute = (t: number) =>
  new Date(t).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" });

/**
 * "Updated 3 min ago" stamp for every data module. Shows the absolute Edmonton time on hover,
 * and flags stale data (the NHL couldn't be reached and a cached copy is shown).
 */
export function LastUpdated({ at, stale, className = "" }: { at: number; stale?: boolean; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!at) return <span className={`text-xs text-fg-muted ${className}`}>Saved data</span>;
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={absolute(at)}
      className={`text-xs ${stale ? "font-semibold text-loss" : "text-fg-muted"} ${className}`}
    >
      {stale ? "Couldn't refresh · showing data from " : "Updated "}
      {now === null ? absolute(at) : relative(Math.max(0, now - at))}
    </time>
  );
}
