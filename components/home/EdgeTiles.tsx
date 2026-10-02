"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { RankPill, rankTone } from "@/components/ui/RankPill";

export type EdgeListRow = { id: number; name: string; pos: string; value: number };
export type EdgeTileData = {
  key: string;
  label: string;
  value: string;
  rank: number | null;
  of: number;
  note?: string | null;
  /** When present, the tile opens a ranked list of every Oilers skater. */
  list?: { title: string; unit: string; digits: number; rows: EdgeListRow[] };
};

/**
 * NHL EDGE tiles. Tiles built on one player's number (top speed, hardest shot) or on the
 * whole roster (speed bursts) open a list of every Oilers skater, ranked.
 */
export function EdgeTiles({ tiles }: { tiles: EdgeTileData[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const panelId = useId();
  const current = tiles.find((t) => t.key === open && t.list);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => {
          const body = (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t.label}</p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <p className={`numeral text-2xl leading-none sm:text-3xl ${rankTone(t.rank, t.of)}`}>{t.value}</p>
                <RankPill rank={t.rank} of={t.of} />
              </div>
              {t.note && <p className="mt-2 text-xs text-fg-muted">{t.note}</p>}
            </>
          );
          if (!t.list || t.list.rows.length === 0) {
            return (
              <div key={t.key} className="card p-4">
                {body}
              </div>
            );
          }
          const isOpen = open === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? null : t.key)}
              className={`card p-4 text-left transition hover:border-line-strong ${isOpen ? "ring-2 ring-[var(--chart-us)]" : ""}`}
            >
              {body}
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-ink">
                {isOpen ? "Hide" : "See"} every player
                <ChevronDown size={14} aria-hidden className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </p>
            </button>
          );
        })}
      </div>

      <div id={panelId} hidden={!current} className="card p-4 sm:p-5">
        {current?.list && <PlayerList list={current.list} />}
      </div>
    </div>
  );
}

function PlayerList({ list }: { list: NonNullable<EdgeTileData["list"]> }) {
  const rows = [...list.rows].sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((r) => r.value));
  const min = Math.min(...rows.map((r) => r.value));
  // Bars start a little below the slowest value so differences are visible, but never at zero width.
  const floor = Math.max(0, min - (max - min) * 0.5);
  return (
    <>
      <h3 className="display text-2xl">{list.title}</h3>
      <p className="mb-3 text-xs text-fg-muted">Every Oilers skater who has played this season, from NHL EDGE.</p>
      <ol className="gap-x-8 md:columns-2">
        {rows.map((r, i) => (
          <li key={r.id} className="grid break-inside-avoid grid-cols-[1.5rem_minmax(0,9rem)_1fr_auto] items-center gap-2 py-0.75 text-sm">
            <span className="numeral text-right text-accent-ink">{i + 1}</span>
            <Link href={`/player/${r.id}`} className="truncate hover:underline">
              {r.name} <span className="text-xs text-fg-muted">{r.pos}</span>
            </Link>
            <span className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <span className="block h-full rounded-full bg-us" style={{ width: `${max > floor ? Math.max(4, ((r.value - floor) / (max - floor)) * 100) : 100}%` }} />
            </span>
            <span className="numeral whitespace-nowrap text-right">
              {r.value.toFixed(list.digits)}
              {list.unit && <span className="ml-0.5 text-xs font-normal text-fg-muted">{list.unit}</span>}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
