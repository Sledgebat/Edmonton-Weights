import Link from "next/link";
import { Module } from "@/components/data/Module";
import type { Loaded } from "@/lib/load";
import type { EdgeGoalie, EdgeSkater } from "@/lib/nhl/schemas";
import { seasonShort } from "@/lib/oilers";
import type { PlayerGoalieSeason, PlayerShootingSeason } from "@/lib/stats/team";
import { signedTone } from "@/lib/tone";

type Pct = { value?: number | null; imperial?: number | null; percentile?: number | null; leagueAvg?: unknown } | undefined;

const avgOf = (p: Pct): number | null => {
  const a = p?.leagueAvg;
  if (typeof a === "number") return a;
  if (a && typeof a === "object") {
    const o = a as { imperial?: number; value?: number };
    return o.imperial ?? o.value ?? null;
  }
  return null;
};

/** The season EDGE "now" data covers: the latest listed regular season. */
function edgeSeason(data: { seasonsWithEdgeStats?: unknown }): number | null {
  const list = data.seasonsWithEdgeStats;
  if (!Array.isArray(list) || !list.length) return null;
  const ids = list.map((s) => (s as { id?: number }).id).filter((n): n is number => typeof n === "number");
  return ids.length ? Math.max(...ids) : null;
}

type Bar = { label: string; value: string; avg: string | null; percentile: number | null; note?: string };

function PercentileBars({ bars }: { bars: Bar[] }) {
  return (
    <ul className="space-y-3">
      {bars.map((b) => {
        const pct = b.percentile === null ? null : Math.round(b.percentile * 100);
        return (
          <li key={b.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-semibold">{b.label}</span>
              <span>
                <span className="numeral text-base">{b.value}</span>
                {b.avg && <span className="ml-2 text-xs text-fg-muted">league avg {b.avg}</span>}
              </span>
            </div>
            {pct !== null && (
              <div className="mt-1 flex items-center gap-2">
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-full bg-us" style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
                <span className="w-24 text-right text-xs text-fg-muted">{ordinalPct(pct)} percentile</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const ordinalPct = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
};

const num = (n: number | null | undefined, d = 1, unit = "") => (n === null || n === undefined ? "—" : `${n.toFixed(d)}${unit}`);

export function SkaterEdge({ edge }: { edge: Loaded<EdgeSkater> }) {
  if (!edge.ok) return null;
  const e = edge.data;
  const season = edgeSeason(e as { seasonsWithEdgeStats?: unknown });
  const speed = e.skatingSpeed?.speedMax as Pct;
  const bursts = e.skatingSpeed?.burstsOver20 as Pct;
  const dist = e.totalDistanceSkated as Pct;
  const shot = e.topShotSpeed as Pct;
  const oz = e.zoneTimeDetails as { offensiveZonePctg?: number; offensiveZonePercentile?: number; offensiveZoneLeagueAvg?: number } | undefined;
  const bars: Bar[] = [
    { label: "Top skating speed", value: num(speed?.imperial, 1, " mph"), avg: avgOf(speed) === null ? null : num(avgOf(speed), 1, " mph"), percentile: speed?.percentile ?? null },
    { label: "Speed bursts over 20 mph", value: num(bursts?.value, 0), avg: avgOf(bursts) === null ? null : num(avgOf(bursts), 1), percentile: bursts?.percentile ?? null },
    { label: "Distance skated", value: num(dist?.imperial, 1, " mi"), avg: avgOf(dist) === null ? null : num(avgOf(dist), 1, " mi"), percentile: dist?.percentile ?? null },
    { label: "Hardest shot", value: num(shot?.imperial, 1, " mph"), avg: avgOf(shot) === null ? null : num(avgOf(shot), 1, " mph"), percentile: shot?.percentile ?? null },
    ...(oz?.offensiveZonePctg !== undefined
      ? [
          {
            label: "Time in the offensive zone",
            value: num(oz.offensiveZonePctg * 100, 1, "%"),
            avg: oz.offensiveZoneLeagueAvg !== undefined ? num(oz.offensiveZoneLeagueAvg * 100, 1, "%") : null,
            percentile: oz.offensiveZonePercentile ?? null,
          },
        ]
      : []),
  ];
  return (
    <Module title={`NHL EDGE tracking${season ? ` · ${seasonShort(season)}` : ""}`} meta={edge.meta}>
      <PercentileBars bars={bars} />
      <p className="mt-3 text-xs text-fg-muted">Puck and player tracking from NHL EDGE. Percentile compares with other NHL skaters; longer bar = higher.</p>
    </Module>
  );
}

export function GoalieEdge({ edge }: { edge: Loaded<EdgeGoalie> }) {
  if (!edge.ok) return null;
  const e = edge.data;
  const season = edgeSeason(e as { seasonsWithEdgeStats?: unknown });
  const loc = new Map((e.shotLocationSummary ?? []).map((l) => [l.locationCode, l as typeof l & { savePctgPercentile?: number; savePctgLeagueAvg?: number }]));
  const sv = (code: string, label: string): Bar | null => {
    const l = loc.get(code);
    if (!l || l.savePctg === undefined) return null;
    return {
      label,
      value: l.savePctg.toFixed(3).replace(/^0/, ""),
      avg: l.savePctgLeagueAvg !== undefined ? l.savePctgLeagueAvg.toFixed(3).replace(/^0/, "") : null,
      percentile: l.savePctgPercentile ?? null,
    };
  };
  const g900 = e.stats?.gamesAbove900;
  const bars = [
    sv("all", "Save % (all shots)"),
    sv("high", "Save % on high-danger shots"),
    sv("mid", "Save % on mid-range shots"),
    sv("long", "Save % on long shots"),
    g900 ? { label: "Games above .900", value: num((g900.value ?? 0) * 100, 0, "%"), avg: avgOf(g900 as Pct) === null ? null : num(avgOf(g900 as Pct)! * 100, 0, "%"), percentile: g900.percentile ?? null } : null,
  ].filter((b): b is Bar => b !== null);
  if (!bars.length) return null;
  return (
    <Module title={`NHL EDGE tracking${season ? ` · ${seasonShort(season)}` : ""}`} meta={edge.meta}>
      <PercentileBars bars={bars} />
      <p className="mt-3 text-xs text-fg-muted">Shot zones from NHL EDGE. Percentile compares with other NHL goalies; longer bar = better.</p>
    </Module>
  );
}

export function SkaterModel({ rows }: { rows: PlayerShootingSeason[] }) {
  if (!rows.length) return null;
  return (
    <Module title="Shot quality (our model)">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="sr-only">Individual expected goals by season</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-fg-muted">
              <th className="px-1 py-1 text-left font-semibold">Season</th>
              <th className="px-1 py-1 text-right font-semibold" title="Goals">G</th>
              <th className="px-1 py-1 text-right font-semibold" title="Individual expected goals">ixG</th>
              <th className="px-1 py-1 text-right font-semibold" title="Goals minus expected goals">G−ixG</th>
              <th className="px-1 py-1 text-right font-semibold" title="Shot attempts">Att</th>
              <th className="px-1 py-1 text-right font-semibold" title="High-danger chances">HD</th>
              <th className="px-1 py-1 text-right font-semibold" title="Expected goals per shot attempt">xG/att</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.goals - r.ixg;
              return (
                <tr key={r.season} className="border-t border-line">
                  <th scope="row" className="px-1 py-1.5 text-left font-semibold">
                    {seasonShort(r.season)}
                  </th>
                  <td className="numeral px-1 text-right">{r.goals}</td>
                  <td className="numeral px-1 text-right">{r.ixg.toFixed(2)}</td>
                  <td className={`numeral px-1 text-right ${signedTone(diff, 2)}`}>
                    {diff > 0 ? "+" : ""}
                    {diff.toFixed(2)}
                  </td>
                  <td className="numeral px-1 text-right">{r.attempts}</td>
                  <td className="numeral px-1 text-right">{r.hdChances}</td>
                  <td className="numeral px-1 text-right">{r.attempts ? (r.ixg / r.attempts).toFixed(3).replace(/^0/, "") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-fg-muted">
        All situations, regular season. G−ixG above zero means finishing better than the chances suggest.{" "}
        <Link href="/stats-guide#xg" className="underline">
          How xG works
        </Link>
      </p>
    </Module>
  );
}

export function GoalieModel({ rows }: { rows: PlayerGoalieSeason[] }) {
  if (!rows.length) return null;
  return (
    <Module title="Goaltending vs expected (our model)">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="sr-only">Goals saved above expected by season</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-fg-muted">
              <th className="px-1 py-1 text-left font-semibold">Season</th>
              <th className="px-1 py-1 text-right font-semibold" title="Shots on goal faced">SA</th>
              <th className="px-1 py-1 text-right font-semibold" title="Save percentage">SV%</th>
              <th className="px-1 py-1 text-right font-semibold" title="Expected save percentage">xSV%</th>
              <th className="px-1 py-1 text-right font-semibold" title="Goals saved above expected">GSAx</th>
              <th className="px-1 py-1 text-right font-semibold" title="High-danger save percentage">HD SV%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.season} className="border-t border-line">
                <th scope="row" className="px-1 py-1.5 text-left font-semibold">
                  {seasonShort(r.season)}
                </th>
                <td className="numeral px-1 text-right">{r.shotsFaced}</td>
                <td className="numeral px-1 text-right">{r.svPct.toFixed(3).replace(/^0/, "")}</td>
                <td className="numeral px-1 text-right">{r.xSvPct.toFixed(3).replace(/^0/, "")}</td>
                <td className={`numeral px-1 text-right ${signedTone(r.gsax, 2)}`}>
                  {r.gsax > 0 ? "+" : ""}
                  {r.gsax.toFixed(2)}
                </td>
                <td className="numeral px-1 text-right">{r.hdFaced ? (1 - r.hdGoals / r.hdFaced).toFixed(3).replace(/^0/, "") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-fg-muted">
        Regular season. GSAx above zero means stopping more than an average goalie would, given the shots faced.{" "}
        <Link href="/stats-guide#gsax" className="underline">
          How GSAx works
        </Link>
      </p>
    </Module>
  );
}
