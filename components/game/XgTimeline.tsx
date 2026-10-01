"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

export type XgRow = { minute: number; us: number; them: number };
/** `y` is the scoring team's cumulative xG at that moment, so the marker sits on its line. */
export type XgGoal = { minute: number; y: number; side: "us" | "them"; label: string; value: number };

const clock = (m: number) => {
  const period = Math.min(4, Math.floor(m / 20) + 1);
  const inP = m - (period - 1) * 20;
  const mm = Math.floor(inP);
  const ss = Math.round((inP - mm) * 60);
  return `${period === 4 ? "OT" : `P${period}`} ${mm}:${String(ss).padStart(2, "0")}`;
};

function XgTooltip({ active, payload, names }: Partial<TooltipContentProps<number, string>> & { names: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as XgRow & Partial<XgGoal>;
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-fg">{clock(row.minute)}</p>
      {row.label ? (
        <p className="text-fg">
          Goal: {row.label} <span className="text-fg-muted">({row.value?.toFixed(2)} xG)</span>
        </p>
      ) : (
        (["us", "them"] as const).map((k) => (
          <p key={k} className="flex items-center gap-2 text-fg">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: `var(--chart-${k})` }} />
            {names[k]} {row[k].toFixed(2)} xG
          </p>
        ))
      )}
    </div>
  );
}

/**
 * Cumulative expected goals through the game, one step per shot, with goals marked on the
 * scoring team's line. Period breaks are dashed lines.
 */
export function XgTimeline({
  rows,
  goals,
  periods,
  names,
  ariaLabel,
}: {
  rows: XgRow[];
  goals: XgGoal[];
  periods: number[];
  names: { us: string; them: string };
  ariaLabel: string;
}) {
  const end = Math.max(60, rows.at(-1)?.minute ?? 60);
  const top = Math.max(1, ...rows.map((r) => Math.max(r.us, r.them)));
  const ticks = [0, 20, 40, 60, ...(end > 60 ? [Math.ceil(end)] : [])];
  return (
    <div className="share-chart h-64 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid vertical={false} className="chart-grid" />
          <XAxis
            dataKey="minute"
            type="number"
            domain={[0, end]}
            ticks={ticks}
            tickFormatter={(v) => (v === 0 ? "Start" : v === 20 ? "P1" : v === 40 ? "P2" : v === 60 ? "P3" : "OT")}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <YAxis domain={[0, Math.ceil(top)]} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={44} />
          {periods.map((p) => (
            <ReferenceLine key={p} x={p} className="chart-ref" strokeDasharray="3 3" />
          ))}
          <Tooltip content={<XgTooltip names={names} />} cursor={{ className: "chart-cursor" }} isAnimationActive={false} />
          {(["them", "us"] as const).map((k) => (
            <Line key={k} type="stepAfter" dataKey={k} name={names[k]} className={`line-${k}`} strokeWidth={2.5} dot={false} activeDot={false} isAnimationActive={false} />
          ))}
          {(["them", "us"] as const).map((k) => (
            <Scatter
              key={`g-${k}`}
              data={goals.filter((g) => g.side === k)}
              dataKey="y"
              className={`dot-${k}`}
              shape={(p: { cx?: number; cy?: number }) => (
                <circle cx={p.cx} cy={p.cy} r={6} className={`dot-${k} goal-dot`} strokeWidth={2} />
              )}
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
