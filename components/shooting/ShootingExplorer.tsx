"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { Shooter, ShootingSeason } from "@/lib/shooting";
import { signedTone } from "@/lib/tone";

const short = (season: number) => {
  const y = Math.floor(season / 10000);
  return `${String(y % 100).padStart(2, "0")}-${String((y + 1) % 100).padStart(2, "0")}`;
};
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const signed = (v: number | null, digits = 1) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`);
const tone = (v: number | null) => signedTone(v, 1);

type Point = ShootingSeason & { label: string };

function CareerTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-fg">
        {p.label}
        {p.current ? " (this season)" : ""}
      </p>
      <p className="text-fg">
        {pct(p.pct)} <span className="text-fg-muted">· {p.goals} goals on {p.shots} shots</span>
      </p>
    </div>
  );
}

/** Career shooting % by season; the line draws itself in when a new player is picked. */
function CareerChart({ s, animate }: { s: Shooter; animate: boolean }) {
  const data: Point[] = s.seasons.filter((x) => x.pct !== null).map((x) => ({ ...x, label: short(x.season) }));
  const avg = s.careerPct;
  const max = Math.max(20, ...data.map((d) => d.pct ?? 0), avg ?? 0);
  const top = Math.ceil((max + 2) / 5) * 5;
  const ticks = Array.from({ length: top / 5 + 1 }, (_, i) => i * 5);
  const above = data.filter((d) => avg !== null && (d.pct ?? 0) > avg).length;
  return (
    <div
      className="career-chart h-64 w-full"
      role="img"
      aria-label={`${s.name}'s shooting percentage in each NHL season${avg !== null ? `, against his career average of ${pct(avg)}: ${above} of ${data.length} seasons above it` : ""}. Numbers are in the table below.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart key={s.id} data={data} margin={{ top: 16, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid vertical={false} className="chart-grid" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis domain={[0, top]} ticks={ticks} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={44} />
          {avg !== null && (
            <ReferenceLine
              y={avg}
              className="chart-ref"
              strokeDasharray="5 4"
              label={{ value: `Career ${pct(avg)}`, position: "insideTopLeft", fontSize: 11 }}
            />
          )}
          <Tooltip content={<CareerTooltip />} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="pct"
            strokeWidth={2}
            isAnimationActive={animate}
            animationDuration={900}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: Point }) => {
              const p = props.payload!;
              const kind = avg === null || p.pct === null ? "dot-even" : p.pct > avg ? "dot-above" : p.pct < avg ? "dot-below" : "dot-even";
              return <circle key={props.index} cx={props.cx} cy={props.cy} r={p.current ? 7 : 5} strokeWidth={p.current ? 3 : 2} className={`${kind} ${p.current ? "dot-now" : ""}`} />;
            }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Every Oilers skater's shooting this season against his career. Pick a player (the table rows
 * are buttons) and the chart above shows his career, season by season.
 */
export function ShootingExplorer({ shooters, seasonName }: { shooters: Shooter[]; seasonName: string }) {
  const withHistory = useMemo(() => shooters.filter((s) => s.seasons.length > 0), [shooters]);
  const [id, setId] = useState<number | null>(withHistory[0]?.id ?? null);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fromUrl = Number(new URLSearchParams(window.location.search).get("player"));
    const t = setTimeout(() => {
      if (reduced) setAnimate(false);
      if (fromUrl && shooters.some((s) => s.id === fromUrl)) setId(fromUrl);
    }, 0);
    return () => clearTimeout(t);
  }, [shooters]);

  function choose(next: number) {
    setId(next);
    const url = new URL(window.location.href);
    url.searchParams.set("player", String(next));
    window.history.replaceState(null, "", url);
  }

  const s = shooters.find((x) => x.id === id) ?? null;
  return (
    <div className="space-y-6">
      <section className="shooting-card p-4 sm:p-5" aria-live="polite">
        {s ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="display text-3xl">{s.name}</h2>
              <p className="text-sm">
                <span className="text-fg-muted">This season</span> <span className="numeral">{pct(s.pct)}</span>
                <span className="mx-2 text-fg-muted">·</span>
                <span className="text-fg-muted">Career</span> <span className="numeral">{pct(s.careerPct)}</span>
                <span className="mx-2 text-fg-muted">·</span>
                <span className={`numeral ${tone(s.vsCareer)}`}>{signed(s.vsCareer)}</span> <span className="text-fg-muted">goals vs career rate</span>
              </p>
            </div>
            <p className="mb-2 mt-1 text-xs text-fg-muted">
              Shooting % in each NHL regular season · green above his career average (dashed line), red below · the big dot is {seasonName}
              {s.careerPct === null ? " · not enough NHL shots yet for a career average" : ""}
            </p>
            {s.seasons.some((x) => x.pct !== null) ? <CareerChart s={s} animate={animate} /> : <p className="text-sm text-fg-muted">No NHL shots yet.</p>}
          </>
        ) : (
          <p className="text-fg-muted">Pick a player below to see his career.</p>
        )}
      </section>

      <section className="card p-4 sm:p-5" aria-label="Every Oilers shooter">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <caption className="sr-only">Oilers shooting this season against career. Select a player to chart his career.</caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-fg-muted">
                <th scope="col" className="px-1 py-1 text-left font-semibold">
                  Player
                </th>
                <th scope="col" className="px-1 py-1 text-right font-semibold" title="Games played">
                  GP
                </th>
                <th scope="col" className="px-1 py-1 text-right font-semibold" title="Goals this season">
                  G
                </th>
                <th scope="col" className="px-1 py-1 text-right font-semibold" title="Shots on goal this season">
                  SOG
                </th>
                <th scope="col" className="px-1 py-1 text-right font-semibold" title="Shooting % this season">
                  SH%
                </th>
                <th scope="col" className="px-1 py-1 text-right font-semibold" title="Career shooting % before this season (NHL regular season)">
                  Career
                </th>
                <th scope="col" className="px-1 py-1 text-right font-semibold" title="This season minus career, in percentage points">
                  Diff
                </th>
                <th scope="col" className="px-1 py-1 text-right font-semibold" title="Goals above or below what his career shooting % would give on this season's shots">
                  vs career
                </th>
              </tr>
            </thead>
            <tbody>
              {shooters.map((r) => {
                const on = r.id === id;
                const diff = r.pct !== null && r.careerPct !== null ? r.pct - r.careerPct : null;
                return (
                  <tr key={r.id} className={`border-t border-line ${on ? "bg-sunken" : ""}`}>
                    <th scope="row" className={`px-1 py-1.5 text-left font-semibold ${on ? "shadow-[inset_4px_0_0_var(--chart-them)]" : ""}`}>
                      <button type="button" aria-pressed={on} onClick={() => choose(r.id)} className={`whitespace-nowrap text-left hover:underline ${on ? "pl-1.5" : ""}`}>
                        {r.name}
                      </button>
                      <span className="ml-1.5 text-xs font-normal text-fg-muted">{r.pos}</span>
                    </th>
                    <td className="numeral px-1 text-right">{r.gp}</td>
                    <td className="numeral px-1 text-right">{r.goals}</td>
                    <td className="numeral px-1 text-right">{r.shots}</td>
                    <td className="numeral px-1 text-right">{pct(r.pct)}</td>
                    <td className="numeral px-1 text-right">{pct(r.careerPct)}</td>
                    <td className={`numeral px-1 text-right ${tone(diff)}`}>{signed(diff)}</td>
                    <td className={`numeral px-1 text-right font-semibold ${tone(r.vsCareer)}`}>{signed(r.vsCareer)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
