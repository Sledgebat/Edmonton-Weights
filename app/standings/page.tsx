import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DataError } from "@/components/data/Module";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Spoiler } from "@/components/ui/Spoiler";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { load } from "@/lib/load";
import { nhl, txt, type StandingsRow } from "@/lib/nhl";
import { conferenceTable, divisionTable, pointPct, signed, streakLabel, teamOf, wildCardTable } from "@/lib/oilers";

export const metadata: Metadata = { title: "Standings" };

type View = "wildcard" | "division" | "conference";
const VIEWS: { key: View; label: string }[] = [
  { key: "division", label: "Division" },
  { key: "wildcard", label: "Wild card" },
  { key: "conference", label: "Conference" },
];

const CONFERENCES = [
  { abbrev: "W", name: "Western Conference" },
  { abbrev: "E", name: "Eastern Conference" },
];

function StandingsTable({
  title,
  rows,
  rank,
  cutAfter,
  cutLabel,
}: {
  title: string;
  rows: StandingsRow[];
  rank: (r: StandingsRow, i: number) => number | string;
  /** Draw the playoff line after this many rows. */
  cutAfter?: number;
  cutLabel?: string;
}) {
  const th = "px-2 py-2 text-right font-semibold";
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[34rem] text-sm">
          <caption className="display bg-header px-3 py-2 text-left text-xl text-header-fg">{title}</caption>
          <thead className="bg-sunken text-[11px] uppercase tracking-wider text-fg-muted">
            <tr>
              <th scope="col" className="w-8 px-2 py-2 text-right font-semibold">
                <abbr title="Rank">#</abbr>
              </th>
              <th scope="col" className="sticky left-0 bg-sunken px-2 py-2 text-left font-semibold">
                Team
              </th>
              <th scope="col" className={th}>
                <abbr title="Games played">GP</abbr>
              </th>
              <th scope="col" className={`${th} hidden sm:table-cell`}>
                <abbr title="Wins">W</abbr>
              </th>
              <th scope="col" className={`${th} hidden sm:table-cell`}>
                <abbr title="Losses">L</abbr>
              </th>
              <th scope="col" className={`${th} hidden sm:table-cell`}>
                <abbr title="Overtime losses">OTL</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Points">PTS</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Points percentage">P%</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Goal differential">GD</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Last 10 games">L10</abbr>
              </th>
              <th scope="col" className={`${th} pr-3`}>
                <abbr title="Streak">STRK</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const edm = teamOf(r) === "EDM";
              const cut = cutAfter !== undefined && i === cutAfter - 1 && i < rows.length - 1;
              return (
                <tr
                  key={teamOf(r)}
                  aria-current={edm ? "true" : undefined}
                  className={`${i ? "border-t border-line" : ""} ${edm ? "bg-sunken font-semibold" : ""} ${
                    cut ? "border-b-[3px] border-b-accent" : ""
                  }`}
                >
                  <td className={`px-2 py-2 text-right text-fg-muted ${edm ? "shadow-[inset_4px_0_0_var(--brand-accent)]" : ""}`}>{rank(r, i)}</td>
                  <th scope="row" className={`sticky left-0 px-2 py-2 text-left font-normal ${edm ? "bg-sunken font-semibold" : "bg-raised"}`}>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <TeamLogo abbrev={teamOf(r)} logo={r.teamLogo} size={24} />
                      <span className="sm:hidden">{teamOf(r)}</span>
                      <span className="hidden sm:inline">{txt(r.teamCommonName)}</span>
                    </span>
                  </th>
                  <td className="px-2 py-2 text-right">{r.gamesPlayed}</td>
                  <td className="hidden px-2 py-2 text-right sm:table-cell">{r.wins}</td>
                  <td className="hidden px-2 py-2 text-right sm:table-cell">{r.losses}</td>
                  <td className="hidden px-2 py-2 text-right sm:table-cell">{r.otLosses}</td>
                  <td className="numeral px-2 py-2 text-right">{r.points}</td>
                  <td className="px-2 py-2 text-right">{pointPct(r)}</td>
                  <td className="px-2 py-2 text-right">{signed(r.goalDifferential)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <Spoiler label="last 10 record">
                      {r.l10Wins}-{r.l10Losses}-{r.l10OtLosses}
                    </Spoiler>
                  </td>
                  <td className="px-2 py-2 pr-3 text-right">
                    <Spoiler label="streak">{streakLabel(r) || "—"}</Spoiler>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cutLabel && cutAfter !== undefined && rows.length > cutAfter && (
        <p className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-fg-muted">
          <span className="inline-block h-[3px] w-6 bg-accent" aria-hidden /> {cutLabel}
        </p>
      )}
    </div>
  );
}

export default async function StandingsPage({ searchParams }: PageProps<"/standings">) {
  await connection();
  const sp = await searchParams;
  const view: View = sp.view === "wildcard" || sp.view === "conference" ? sp.view : "division";
  const standings = await load(nhl.standings);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">League table</p>
      <h1 className="display-hero mt-2 text-6xl sm:text-7xl">Standings</h1>

      <nav aria-label="Standings view" className="mt-6 flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key === "division" ? "/standings" : `/standings?view=${v.key}`}
            aria-current={view === v.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              view === v.key ? "border-button bg-button text-button-fg" : "border-line-strong hover:bg-sunken"
            }`}
          >
            {v.label}
          </Link>
        ))}
        {standings.ok && <LastUpdated at={standings.meta.fetchedAt} stale={standings.meta.stale} className="ml-auto" />}
      </nav>

      {!standings.ok ? (
        <div className="mt-6">
          <DataError what="standings" error={standings.error} />
        </div>
      ) : (
        <div className="mt-6 space-y-10">
          {CONFERENCES.map((conf) => {
            const rows = standings.data.standings;
            if (view === "conference") {
              return (
                <StandingsTable key={conf.abbrev} title={conf.name} rows={conferenceTable(rows, conf.abbrev)} rank={(r) => r.conferenceSequence} />
              );
            }
            if (view === "division") {
              const divisions = [...new Set(rows.filter((r) => r.conferenceAbbrev === conf.abbrev).map((r) => r.divisionAbbrev))];
              // Pacific first for the Western Conference.
              divisions.sort((a, b) => (a === "P" ? -1 : b === "P" ? 1 : a.localeCompare(b)));
              return (
                <section key={conf.abbrev} aria-label={conf.name} className="space-y-4">
                  <h2 className="display text-3xl">{conf.name}</h2>
                  {divisions.map((d) => {
                    const table = divisionTable(rows, d);
                    return (
                      <StandingsTable
                        key={d}
                        title={`${table[0]?.divisionName ?? d} Division`}
                        rows={table}
                        rank={(r) => r.divisionSequence}
                        cutAfter={3}
                        cutLabel="Top three in each division make the playoffs"
                      />
                    );
                  })}
                </section>
              );
            }
            const wc = wildCardTable(rows, conf.abbrev);
            return (
              <section key={conf.abbrev} aria-label={conf.name} className="space-y-4">
                <h2 className="display text-3xl">{conf.name}</h2>
                {wc.leaders.map((l) => (
                  <StandingsTable key={l.division} title={`${l.name} Division`} rows={l.rows} rank={(r) => r.divisionSequence} />
                ))}
                <StandingsTable
                  title="Wild card"
                  rows={wc.wildCard}
                  rank={(_, i) => (i < wc.cutAfter ? `WC${i + 1}` : i + 1)}
                  cutAfter={wc.cutAfter}
                  cutLabel="Playoff line: two wild cards per conference"
                />
              </section>
            );
          })}
          <p className="text-xs text-fg-muted">
            Spoiler-free mode hides the last-10 records and streaks. Ties are broken by the NHL&apos;s own ordering.
          </p>
        </div>
      )}
    </div>
  );
}
