"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RatingBadge } from "@/components/data/RatingBadge";

export type Format = "int" | "signed" | "pct1" | "dec2" | "signed1" | "signed2" | "sv" | "toi" | "text" | "rating";

export type Column = {
  key: string;
  label: string;
  /** Spelled-out name, shown as a tooltip and read by screen readers. */
  title?: string;
  format: Format;
  /** Sort descending first (most stats); false for e.g. GAA or names. */
  descFirst?: boolean;
  /** Colour above zero as good, below as bad. */
  tone?: boolean;
};

/**
 * One row. Optional fields: `href` (where the name links; default the player page, null = no
 * link), `team` (shown after the name), `pos`, and `highlight` (1 = a standout row).
 */
export type TableRow = Record<string, string | number | null> & { id: number | string; name: string };

function fmt(v: string | number | null, f: Format): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  switch (f) {
    case "signed":
      return v > 0 ? `+${v}` : String(v);
    case "pct1":
      return v.toFixed(1);
    case "dec2":
      return v.toFixed(2);
    case "signed1":
      return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
    case "signed2":
      return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
    case "sv":
      return v.toFixed(3).replace(/^0/, "");
    case "rating":
      return v.toFixed(1);
    case "toi":
      return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
    default:
      return String(v);
  }
}

/** A stats table whose columns sort on click. Names link to player pages. */
export function SortableTable({
  columns,
  rows,
  initialSort,
  caption,
  nameLabel = "Player",
  minWidth = "40rem",
}: {
  columns: Column[];
  rows: TableRow[];
  initialSort: string;
  caption: string;
  nameLabel?: string;
  minWidth?: string;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: initialSort, desc: true });

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      // Missing values always sink to the bottom.
      if (x === null) return 1;
      if (y === null) return -1;
      const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
      return sort.desc ? -c : c;
    });
    return out;
  }, [rows, sort]);

  const toggle = (c: Column) =>
    setSort((s) => (s.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: c.descFirst ?? c.format !== "text" }));

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}. Select a column heading to sort.</caption>
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-fg-muted">
            <th scope="col" className="sticky left-0 bg-raised px-1 py-1 text-left">
              <SortButton active={sort.key === "name"} desc={sort.desc} onClick={() => toggle({ key: "name", label: nameLabel, format: "text", descFirst: false })}>
                {nameLabel}
              </SortButton>
            </th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="px-1 py-1 text-right" aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                <SortButton active={sort.key === c.key} desc={sort.desc} onClick={() => toggle(c)} title={c.title}>
                  {c.label}
                </SortButton>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className={`border-t border-line ${r.highlight ? "bg-sunken" : ""}`}>
              <th
                scope="row"
                className={`sticky left-0 whitespace-nowrap px-1 py-1.5 text-left font-semibold ${r.highlight ? "bg-sunken shadow-[inset_3px_0_0_var(--brand-accent)]" : "bg-raised"}`}
              >
                {r.href === null ? (
                  r.name
                ) : (
                  <Link href={typeof r.href === "string" ? r.href : `/player/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                )}
                {typeof r.pos === "string" && <span className="ml-1.5 text-xs font-normal text-fg-muted">{r.pos}</span>}
                {typeof r.team === "string" && <span className="ml-1.5 text-xs font-normal text-fg-muted">{r.team}</span>}
              </th>
              {columns.map((c) => {
                const v = r[c.key];
                const tone = c.tone && typeof v === "number" && Math.abs(v) >= 0.005 ? (v > 0 ? "text-win" : "text-loss") : "";
                return (
                  <td key={c.key} className={`numeral whitespace-nowrap px-1 text-right ${tone} ${sort.key === c.key ? "font-semibold" : ""}`}>
                    {c.format === "rating" && typeof v === "number" ? <RatingBadge rating={v} /> : fmt(v, c.format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortButton({ active, desc, onClick, title, children }: { active: boolean; desc: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} className={`inline-flex items-center gap-0.5 font-semibold uppercase hover:text-fg ${active ? "text-fg" : ""}`}>
      {title ? <abbr title={title} className="no-underline">{children}</abbr> : children}
      {active ? desc ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden /> : null}
    </button>
  );
}
