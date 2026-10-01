import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DataError, Module } from "@/components/data/Module";
import { SortableTable, type Column, type TableRow } from "@/components/players/SortableTable";
import { seasonLabel } from "@/lib/nhl/endpoints";
import { playersData } from "@/lib/players";

export const metadata: Metadata = { title: "Players" };

const SKATER_COLUMNS: Column[] = [
  { key: "gp", label: "GP", title: "Games played", format: "int" },
  { key: "g", label: "G", title: "Goals", format: "int" },
  { key: "a", label: "A", title: "Assists", format: "int" },
  { key: "p", label: "P", title: "Points", format: "int" },
  { key: "pm", label: "+/-", title: "Plus-minus", format: "signed", tone: true },
  { key: "sog", label: "SOG", title: "Shots on goal", format: "int" },
  { key: "shPct", label: "S%", title: "Shooting percentage", format: "pct1" },
  { key: "toi", label: "TOI", title: "Average time on ice per game", format: "toi" },
  { key: "ixg", label: "ixG", title: "Individual expected goals: the quality of the player's own shots", format: "dec2" },
  { key: "hd", label: "HD", title: "High-danger chances taken", format: "int" },
  { key: "gax", label: "G−ixG", title: "Goals minus individual expected goals: above zero means finishing better than expected", format: "signed2", tone: true },
];

const GOALIE_COLUMNS: Column[] = [
  { key: "gp", label: "GP", title: "Games played", format: "int" },
  { key: "w", label: "W", title: "Wins", format: "int" },
  { key: "l", label: "L", title: "Losses", format: "int" },
  { key: "otl", label: "OTL", title: "Overtime and shootout losses", format: "int" },
  { key: "sv", label: "SV%", title: "Save percentage", format: "sv" },
  { key: "gaa", label: "GAA", title: "Goals against average", format: "dec2", descFirst: false },
  { key: "so", label: "SO", title: "Shutouts", format: "int" },
  { key: "xsv", label: "xSV%", title: "Expected save percentage, given the shots faced", format: "sv" },
  { key: "gsax", label: "GSAx", title: "Goals saved above expected", format: "signed2", tone: true },
];

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  await connection();
  const { season: requested } = await searchParams;
  const d = await playersData(typeof requested === "string" ? requested : undefined);
  const options = [
    { key: "this", label: seasonLabel(d.currentSeason) },
    { key: "last", label: seasonLabel(d.currentSeason - 10001) },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-hero text-5xl sm:text-6xl">Players</h1>
          <p className="mt-1 text-fg-muted">
            Oilers season stats, regular season. Select a column to sort.{" "}
            <Link href="/roster" className="underline">
              Roster cards
            </Link>
          </p>
        </div>
        <nav aria-label="Season" className="flex gap-1 rounded-lg bg-sunken p-1">
          {options.map((o) => (
            <Link
              key={o.key}
              href={`/players?season=${o.key}`}
              aria-current={d.choice === o.key ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${d.choice === o.key ? "bg-raised text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
            >
              {o.label}
            </Link>
          ))}
        </nav>
      </div>
      {d.note && <p className="text-sm text-fg-muted">{d.note}</p>}

      {!d.stats.ok ? (
        <DataError what="player stats" error={d.stats.error} />
      ) : (
        <>
          <Module title={`Skaters · ${seasonLabel(d.season)}`} meta={d.stats.meta}>
            <SortableTable columns={SKATER_COLUMNS} rows={d.skaters as unknown as TableRow[]} initialSort="p" caption={`Oilers skaters, ${seasonLabel(d.season)}`} />
            <p className="mt-3 text-xs text-fg-muted">
              ixG, HD and G−ixG come from our expected-goals model, all situations.{" "}
              {!d.hasAdvanced && "They fill in once games from this season are stored. "}
              <Link href="/stats-guide" className="underline">
                What these mean
              </Link>
            </p>
          </Module>
          <Module title={`Goalies · ${seasonLabel(d.season)}`} meta={d.stats.meta}>
            <SortableTable columns={GOALIE_COLUMNS} rows={d.goalies as unknown as TableRow[]} initialSort="gp" caption={`Oilers goalies, ${seasonLabel(d.season)}`} />
            <p className="mt-3 text-xs text-fg-muted">xSV% and GSAx count only shots faced for the Oilers, from our expected-goals model.</p>
          </Module>
        </>
      )}
    </div>
  );
}
