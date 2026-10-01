"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Ticking countdown to puck drop. Renders nothing until mounted (avoids a hydration mismatch). */
export function Countdown({ to, className = "" }: { to: string; className?: string }) {
  const target = Date.parse(to);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (now === null) return <span className={className}>&nbsp;</span>;
  const left = target - now;
  if (left <= 0) return <span className={className}>Puck drop!</span>;
  const { d, h, m, s } = parts(left);
  const units: [number, string][] = d > 0 ? [[d, "d"], [h, "h"], [m, "m"]] : [[h, "h"], [m, "m"], [s, "s"]];
  return (
    <span className={className} aria-label={`Starts in ${d ? `${d} days ` : ""}${h} hours ${m} minutes`}>
      {units.map(([v, u]) => (
        <span key={u} className="mr-2 inline-block last:mr-0">
          <span className="numeral">{String(v).padStart(u === "d" ? 1 : 2, "0")}</span>
          <span className="ml-0.5 text-[0.55em] uppercase opacity-80">{u}</span>
        </span>
      ))}
    </span>
  );
}
