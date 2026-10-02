"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
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
 * link), `team` (shown after the name), `pos`, `highlight` (1 = a standout row, shaded with a
 * star) and `ours` (1 = an Oilers player: orange bar and team label).
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
  teamFilter,
  pageSizes,
  rankLabel,
}: {
  columns: Column[];
  rows: TableRow[];
  initialSort: string;
  caption: string;
  nameLabel?: string;
  minWidth?: string;
  /** Buttons that show only the rows whose `team` matches (plus "Both teams"). */
  teamFilter?: { label: string; options: { key: string; label: string }[] };
  /** Split long tables into pages, e.g. [30, 50, 100, "all"]; the first is the default. */
  pageSizes?: (number | "all")[];
  /** Show each row's `rank` field in a first column with this heading (e.g. "#"). */
  rankLabel?: string;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: initialSort, desc: true });
  const [team, setTeam] = useState<string>("all");
  const [pageSize, setPageSize] = useState<number | "all">(pageSizes?.[0] ?? "all");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const out = team === "all" ? [...rows] : rows.filter((r) => r.team === team);
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
  }, [rows, sort, team]);

  const pages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = pageSize === "all" ? sorted : sorted.slice(current * pageSize, (current + 1) * pageSize);

  const toggle = (c: Column) => {
    setPage(0);
    setSort((s) => (s.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: c.descFirst ?? c.format !== "text" }));
  };

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${active ? "border-button bg-button text-button-fg" : "border-line-strong hover:bg-sunken"}`;

  const sizePicker = pageSizes && (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div role="group" aria-label="Players per page" className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-fg-muted">Per page</span>
        {pageSizes.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={pageSize === n}
            onClick={() => {
              setPageSize(n);
              setPage(0);
            }}
            className={pill(pageSize === n)}
          >
            {n === "all" ? "All" : n}
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-muted" aria-live="polite">
        {sorted.length === 0
          ? "No players"
          : `Showing ${pageSize === "all" ? 1 : current * pageSize + 1}–${pageSize === "all" ? sorted.length : Math.min(sorted.length, (current + 1) * pageSize)} of ${sorted.length}`}
      </p>
    </div>
  );

  const pager = pageSizes && pages > 1 && (
    <nav aria-label="Table pages" className="mt-3 flex items-center justify-center gap-2 text-sm">
      <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} className={`${pill(false)} inline-flex items-center gap-0.5 disabled:opacity-40`}>
        <ChevronLeft size={14} aria-hidden /> Previous
      </button>
      <span className="numeral px-2 text-fg-muted">
        Page {current + 1} of {pages}
      </span>
      <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} className={`${pill(false)} inline-flex items-center gap-0.5 disabled:opacity-40`}>
        Next <ChevronRight size={14} aria-hidden />
      </button>
    </nav>
  );

  const filter = teamFilter && (
    <div role="group" aria-label={teamFilter.label} className="mb-3 flex flex-wrap gap-1">
      {[{ key: "all", label: "Both teams" }, ...teamFilter.options].map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={team === o.key}
          onClick={() => setTeam(o.key)}
          className={pill(team === o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="-mx-1 overflow-x-auto">
      {filter}
      {sizePicker}
      <table className="w-full text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}. Select a column heading to sort.</caption>
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-fg-muted">
            {rankLabel && (
              <th scope="col" className="w-8 px-1 py-1 text-right">
                {rankLabel}
              </th>
            )}
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
          {shown.map((r) => (
            <tr key={r.id} className={`border-t border-line ${r.highlight ? "bg-sunken" : ""}`}>
              {rankLabel && <td className="numeral px-1 text-right text-fg-muted">{r.rank ?? ""}</td>}
              <th
                scope="row"
                className={`sticky left-0 whitespace-nowrap px-1 py-1.5 text-left font-semibold ${r.highlight ? "bg-sunken" : "bg-raised"} ${r.ours ? "pl-2.5 shadow-[inset_4px_0_0_var(--chart-us)]" : ""}`}
              >
                {r.highlight ? (
                  <span className="mr-1 text-accent-ink" title="Top three of the night">
                    ★<span className="sr-only">Top three of the night: </span>
                  </span>
                ) : null}
                {r.href === null ? (
                  r.name
                ) : (
                  <Link href={typeof r.href === "string" ? r.href : `/player/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                )}
                {typeof r.pos === "string" && <span className="ml-1.5 text-xs font-normal text-fg-muted">{r.pos}</span>}
                {typeof r.team === "string" && (
                  <span className={`ml-1.5 text-xs ${r.ours ? "font-semibold text-accent-ink" : "font-normal text-fg-muted"}`}>{r.team}</span>
                )}
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
      {pager}
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
