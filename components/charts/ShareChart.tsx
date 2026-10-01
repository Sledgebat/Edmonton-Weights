"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

export type SharePoint = { label: string; detail: string; value: number };
export type ShareSeries = { key: "us" | "them"; name: string; points: SharePoint[] };

type Row = { x: string; us?: number; them?: number; usDetail?: string; themDetail?: string };

function ShareTooltip({ active, payload, names }: Partial<TooltipContentProps<number, string>> & { names: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-lg">
      {(["us", "them"] as const).map((k) =>
        row[k] === undefined ? null : (
          <p key={k} className="flex items-center gap-2 text-fg">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: `var(--chart-${k})` }} />
            <span className="font-semibold">{names[k]}</span> {row[k]!.toFixed(1)}%
            <span className="text-fg-muted">{row[`${k}Detail`]}</span>
          </p>
        ),
      )}
    </div>
  );
}

/**
 * A share stat (e.g. 5-on-5 expected-goals share) over a run of games, for one or two teams,
 * with the 50% break-even line. Colours come from theme tokens; identity is also in the legend
 * the page draws above the chart.
 */
export function ShareChart({ series, ariaLabel, xTitle }: { series: ShareSeries[]; ariaLabel: string; xTitle?: string }) {
  const length = Math.max(...series.map((s) => s.points.length));
  const rows: Row[] = Array.from({ length }, (_, i) => {
    const row: Row = { x: "" };
    for (const s of series) {
      // Align runs of different lengths on their most recent game.
      const p = s.points[s.points.length - length + i];
      if (p) {
        row[s.key] = Math.round(p.value * 10) / 10;
        row[`${s.key}Detail`] = `${p.label} · ${p.detail}`;
        if (!row.x) row.x = p.label;
      }
    }
    return row;
  });
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const lo = Math.max(0, Math.floor((Math.min(30, ...values) - 5) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(70, ...values) + 5) / 10) * 10);
  const names = Object.fromEntries(series.map((s) => [s.key, s.name]));

  return (
    <div className="share-chart h-60 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 10, right: 12, bottom: xTitle ? 16 : 4, left: -12 }}>
          <CartesianGrid vertical={false} className="chart-grid" />
          <XAxis dataKey="x" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis domain={[lo, hi]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={48} />
          <ReferenceLine y={50} className="chart-ref" strokeDasharray="0" />
          <Tooltip content={<ShareTooltip names={names} />} cursor={{ className: "chart-cursor" }} isAnimationActive={false} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="linear"
              dataKey={s.key}
              name={s.name}
              className={`line-${s.key}`}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, className: `dot-${s.key}` }}
              activeDot={{ r: 6, strokeWidth: 2, className: `dot-${s.key}` }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
