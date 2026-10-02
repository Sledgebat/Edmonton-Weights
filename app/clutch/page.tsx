import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SortableTable, type Column, type TableRow } from "@/components/players/SortableTable";
import { clutchData } from "@/lib/clutch";
import { seasonLabel } from "@/lib/nhl/endpoints";
import { CLUTCH } from "@/lib/stats/clutch";

export const metadata: Metadata = { title: "Clutch leaders" };

const COLUMNS: Column[] = [
  { key: "score", label: "Clutch", title: "Clutch Score", format: "dec2" },
  { key: "goals", label: "G", title: "Clutch goals", format: "int" },
  { key: "assists", label: "A", title: "Clutch assists", format: "int" },
  { key: "ot", label: "OTW", title: "Overtime winners", format: "int" },
  { key: "tying", label: "TIE", title: "Tying goals in the last 10 minutes of the third", format: "int" },
  { key: "goAhead", label: "GA", title: "Go-ahead goals from a tie in the last 10 minutes of the third", format: "int" },
  { key: "insurance", label: "INS", title: "Insurance goals: from up one to up two in the last 10 minutes of the third", format: "int" },
];

/** Every NHL player with a clutch point this season, Oilers marked. */
export default async function ClutchPage() {
  const d = await clutchData();
  const oilers = d.rows.filter((r) => r.ours);
  const rows: TableRow[] = d.rows.map((r) => ({
    id: r.playerId,
    name: r.name,
    href: r.href,
    pos: r.pos,
    team: r.team,
    ours: r.ours ? 1 : 0,
    rank: r.rank,
    score: r.score,
    goals: r.goals,
    assists: r.assists,
    ot: r.ot,
    tying: r.tying,
    goAhead: r.goAhead,
    insurance: r.insurance,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={14} aria-hidden /> Home
      </Link>
      <div>
        <h1 className="display-hero text-5xl sm:text-6xl">Clutch leaders</h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Every NHL player with a clutch point in {seasonLabel(d.season)}: overtime winners ({CLUTCH.otWinner}), tying and go-ahead goals in the last 10
          minutes of the third ({CLUTCH.tying}), and late insurance goals ({CLUTCH.insurance}). Assists earn part of the goal&apos;s value.{" "}
          <Link href="/stats-guide#clutch" className="underline">
            How it&apos;s worked out
          </Link>
        </p>
      </div>

      {oilers.length > 0 && (
        <div className="clutch-card p-4 text-sm">
          <p className="font-semibold">Oilers on the list</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {oilers.slice(0, 10).map((r) => (
              <li key={r.playerId}>
                <span className="numeral text-accent-ink">#{r.rank}</span> {r.name} <span className="numeral text-fg-muted">{r.score.toFixed(2)}</span>
              </li>
            ))}
            {oilers.length > 10 && <li className="text-fg-muted">and {oilers.length - 10} more</li>}
          </ul>
        </div>
      )}

      <section className="card p-4 sm:p-5" aria-label="League clutch leaders">
        {rows.length > 0 ? (
          <SortableTable
            columns={COLUMNS}
            rows={rows}
            initialSort="score"
            caption={`NHL clutch leaders, ${seasonLabel(d.season)}`}
            minWidth="36rem"
            pageSizes={[30, 50, 100, "all"]}
            rankLabel="#"
          />
        ) : (
          <p className="text-fg-muted">
            {d.ready ? "No clutch points yet this season. The first late tying goal or overtime winner will show up here." : "Clutch Score appears after the next update."}
          </p>
        )}
        <p className="mt-3 text-xs text-fg-muted">
          Regular season and playoffs (playoff goals count {CLUTCH.playoffs}×). Rank is by Clutch Score. Teams are each player&apos;s most recent team. Oilers
          are marked in orange. Just for fun: a handful of goals can move a player a long way up the list.
        </p>
      </section>
    </div>
  );
}
