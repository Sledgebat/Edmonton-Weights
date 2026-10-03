import Link from "next/link";
import { Module } from "@/components/data/Module";
import type { Linemate, OnIce } from "@/lib/stats/onice";
import { signedTone } from "@/lib/tone";

const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const rel = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);
const minutes = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const tone = (v: number | null) => signedTone(v, 1);

/** 5-on-5 results with the player on the ice, against the team's results without him. */
export function OnIceImpact({ o, avgRating, season }: { o: OnIce | null; avgRating: number | null; season: string }) {
  return (
    <Module title="On-ice impact">
      {!o ? (
        <p className="text-sm text-fg-muted">Shows up once he&apos;s played a game with shift data this season.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            {season} · 5 on 5 · {o.gp} games · {minutes(o.toi5)} on the ice. &ldquo;Off&rdquo; is the team in the same games while he was on the bench.
          </p>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[20rem] text-sm">
              <caption className="sr-only">On-ice and off-ice shares at 5 on 5</caption>
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-fg-muted">
                  <th className="px-1 py-1 text-left font-semibold">Share</th>
                  <th className="px-1 py-1 text-right font-semibold">On</th>
                  <th className="px-1 py-1 text-right font-semibold">Off</th>
                  <th className="px-1 py-1 text-right font-semibold" title="On minus off, in percentage points">
                    Relative
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <th scope="row" className="px-1 py-1.5 text-left font-semibold">
                    Expected goals (xGF%)
                  </th>
                  <td className="numeral px-1 text-right">{pct(o.xgfPct)}</td>
                  <td className="numeral px-1 text-right text-fg-muted">{pct(o.offXgfPct)}</td>
                  <td className={`numeral px-1 text-right ${tone(o.relXgfPct)}`}>{rel(o.relXgfPct)}</td>
                </tr>
                <tr className="border-t border-line">
                  <th scope="row" className="px-1 py-1.5 text-left font-semibold">
                    Shot attempts (CF%)
                  </th>
                  <td className="numeral px-1 text-right">{pct(o.cfPct)}</td>
                  <td className="numeral px-1 text-right text-fg-muted">{pct(o.offCfPct)}</td>
                  <td className={`numeral px-1 text-right ${tone(o.relCfPct)}`}>{rel(o.relCfPct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded bg-sunken px-2 py-1.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Goals for–against</dt>
              <dd className="numeral">
                {o.gf}–{o.ga}
              </dd>
            </div>
            <div className="rounded bg-sunken px-2 py-1.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">xG for–against</dt>
              <dd className="numeral">
                {o.xgf.toFixed(1)}–{o.xga.toFixed(1)}
              </dd>
            </div>
            <div className="rounded bg-sunken px-2 py-1.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Average rating</dt>
              <dd className="numeral">{avgRating === null ? "—" : avgRating.toFixed(1)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-fg-muted">
            Relative above zero means the Oilers controlled play better with him on the ice than without him.{" "}
            <Link href="/stats-guide#on-ice" className="underline">
              More
            </Link>
          </p>
        </>
      )}
    </Module>
  );
}

export function Linemates({ rows, defence }: { rows: (Linemate & { name: string; href: string })[]; defence: boolean }) {
  return (
    <Module title={defence ? "Most common partners" : "Most common linemates"}>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Shows up once he&apos;s played a game with shift data this season.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-fg-muted">5-on-5 time together this season, and how play went with both on the ice.</p>
          <table className="w-full text-sm">
            <caption className="sr-only">{defence ? "Defence partners" : "Linemates"} by time together</caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-fg-muted">
                <th className="px-1 py-1 text-left font-semibold">Player</th>
                <th className="px-1 py-1 text-right font-semibold" title="Games together">
                  GP
                </th>
                <th className="px-1 py-1 text-right font-semibold" title="5-on-5 time together">
                  TOI
                </th>
                <th className="px-1 py-1 text-right font-semibold" title="Expected-goals share together">
                  xGF%
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.playerId} className="border-t border-line">
                  <th scope="row" className="px-1 py-1.5 text-left font-semibold">
                    <Link href={m.href} className="hover:underline">
                      {m.name}
                    </Link>
                  </th>
                  <td className="numeral px-1 text-right">{m.gp}</td>
                  <td className="numeral px-1 text-right">{minutes(m.toi5)}</td>
                  <td className="numeral px-1 text-right">{pct(m.xgfPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Module>
  );
}
