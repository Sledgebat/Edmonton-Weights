"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

export type LuckPoint = { label: string; opponent: string; actual: number; deserved: number };

function LuckTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as LuckPoint & { game: number };
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-fg">
        Game {p.game} · {p.label} {p.opponent}
      </p>
      <p className="text-fg">
        {p.actual} points · deserved {p.deserved.toFixed(1)}
      </p>
    </div>
  );
}

/**
 * Points banked game by game against the points the chances deserved, both added up over the
 * season. Actual points use the team colour; deserved is a dashed neutral line (luck isn't
 * good or bad play, so neither line is green or red).
 */
export function LuckChart({ points, team, ariaLabel }: { points: LuckPoint[]; team: string; ariaLabel: string }) {
  const rows = points.map((p, i) => ({ ...p, game: i + 1, deserved: Math.round(p.deserved * 10) / 10 }));
  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-5 bg-us" /> {team} points
        </span>
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <span aria-hidden className="inline-block w-5 border-t-2 border-dashed border-current" /> Deserved from their chances
        </span>
      </div>
      <div className="share-chart h-56 w-full" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid vertical={false} className="chart-grid" />
            <XAxis dataKey="game" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={44} />
            <Tooltip content={<LuckTooltip />} cursor={{ className: "chart-cursor" }} isAnimationActive={false} />
            <Line type="linear" dataKey="deserved" className="line-deserved" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="actual" className="line-us" strokeWidth={2} dot={rows.length > 30 ? false : { r: 3, strokeWidth: 2, className: "dot-us" }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
