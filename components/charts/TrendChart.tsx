"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

export type TrendPoint = { label: string; opponent: string; value: number; detail: string };

function TrendTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as TrendPoint;
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-fg">
        {p.label} {p.opponent}
      </p>
      <p className="text-fg-muted">{p.detail}</p>
    </div>
  );
}

/**
 * One-series line for the last 10 games (points per game, or save percentage for goalies).
 * Single series, so no legend: the heading names it. The game log table below is the table view.
 */
export function TrendChart({
  data,
  yDomain,
  yTicks,
  yFormat = "int",
  ariaLabel,
}: {
  data: TrendPoint[];
  yDomain: [number, number];
  yTicks?: number[];
  /** Strings, not functions: this component is rendered from server components. */
  yFormat?: "int" | "savePct";
  ariaLabel: string;
}) {
  const formatY = (v: number) => (yFormat === "savePct" ? v.toFixed(3).replace(/^0/, "") : String(v));
  return (
    <div className="trend-chart h-56 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid vertical={false} className="trend-grid" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis domain={yDomain} ticks={yTicks} tickFormatter={formatY} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={44} allowDecimals={false} />
          <Tooltip content={<TrendTooltip />} cursor={{ className: "trend-cursor" }} isAnimationActive={false} />
          <Line
            type="linear"
            dataKey="value"
            className="trend-line"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, className: "trend-dot" }}
            activeDot={{ r: 6, strokeWidth: 2, className: "trend-dot" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
