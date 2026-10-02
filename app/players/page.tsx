import type { Metadata } from "next";
import Link from "next/link";
import { DataError, Module } from "@/components/data/Module";
import { SortableTable, type Column, type TableRow } from "@/components/players/SortableTable";
import { RosterCards } from "@/components/players/RosterCards";
import { ViewTabs } from "@/components/ui/ViewTabs";
import { linesData, type LinesData, type NamedUnit } from "@/lib/lines";
import { seasonLabel } from "@/lib/nhl/endpoints";
import { formatGameDate } from "@/lib/oilers";
import { playersData, type PlayersData } from "@/lib/players";

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
  { key: "oixgf", label: "On-ice xGF%", title: "5-on-5 expected-goals share while he's on the ice", format: "pct1" },
  { key: "relxgf", label: "Rel xGF%", title: "On-ice xGF% minus the team's xGF% with him off the ice, in the same games: above zero means the team does better with him on", format: "signed1", tone: true },
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

function SeasonTables({ d }: { d: PlayersData }) {
  return (
    <div className="mt-4 space-y-6">
      {d.note && <p className="text-sm text-fg-muted">{d.note}</p>}
      {!d.stats.ok ? (
        <DataError what="player stats" error={d.stats.error} />
      ) : (
        <>
          <Module title={`Skaters · ${seasonLabel(d.season)}`} meta={d.stats.meta}>
            <SortableTable columns={SKATER_COLUMNS} rows={d.skaters as unknown as TableRow[]} initialSort="p" caption={`Oilers skaters, ${seasonLabel(d.season)}`} />
            <p className="mt-3 text-xs text-fg-muted">
              ixG, HD and G−ixG come from our expected-goals model, all situations. On-ice xGF% and Rel xGF% are 5 on 5, from the NHL&apos;s shift
              charts.{" "}
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

const UNIT_COLUMNS: Column[] = [
  { key: "gp", label: "GP", title: "Games together", format: "int" },
  { key: "toi", label: "TOI", title: "5-on-5 time together, minutes:seconds", format: "toi" },
  { key: "xgf", label: "xGF%", title: "5-on-5 expected-goals share with this group on the ice", format: "pct1" },
  { key: "cf", label: "CF%", title: "5-on-5 shot-attempt share with this group on the ice", format: "pct1" },
  { key: "gf", label: "GF", title: "5-on-5 goals for with this group on the ice", format: "int" },
  { key: "ga", label: "GA", title: "5-on-5 goals against with this group on the ice", format: "int", descFirst: false },
];

const unitRows = (units: NamedUnit[]): TableRow[] =>
  units.map((u) => ({ id: u.players.join("-"), name: u.names.join(" – "), href: null, gp: u.gp, toi: u.toi5, xgf: u.xgfPct, cf: u.cfPct, gf: u.gf, ga: u.ga }));

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function CurrentUnits({ title, units }: { title: string; units: NamedUnit[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-fg-muted">{title}</h3>
      <ol className="space-y-2">
        {units.map((u, i) => (
          <li key={u.players.join("-")} className="flex items-baseline justify-between gap-3 rounded-md bg-sunken px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="numeral mr-2 text-accent-ink">{i + 1}</span>
              {u.ids.map((id, j) => (
                <span key={id}>
                  {j > 0 && " – "}
                  <Link href={`/player/${id}`} className="font-semibold hover:underline">
                    {u.names[j]}
                  </Link>
                </span>
              ))}
            </span>
            <span className="numeral whitespace-nowrap text-xs text-fg-muted" title="5-on-5 time together in that game">
              {mmss(u.toi5)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Lines({ d }: { d: LinesData }) {
  if (!d.current) {
    return <p className="mt-4 text-sm text-fg-muted">Lines appear once this season&apos;s games have shift data from the NHL.</p>;
  }
  return (
    <div className="mt-4 space-y-6">
      <Module title="Current lines">
        <p className="mb-3 text-xs text-fg-muted">
          From the most recent game ({formatGameDate(d.current.date + "T18:00:00Z")} vs {d.current.opponent}): the forward groups and defence pairs that
          played the most 5-on-5 minutes together. Not an official lineup.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <CurrentUnits title="Forward lines" units={d.current.lines} />
          <CurrentUnits title="Defence pairs" units={d.current.pairs} />
        </div>
      </Module>
      <Module title={`Forward lines · ${seasonLabel(d.season)}`}>
        {d.lines.length ? (
          <SortableTable columns={UNIT_COLUMNS} rows={unitRows(d.lines)} initialSort="toi" caption="Oilers forward lines this season" nameLabel="Line" minWidth="34rem" />
        ) : (
          <p className="text-sm text-fg-muted">No line has played {d.minMinutes} minutes together yet.</p>
        )}
      </Module>
      <Module title={`Defence pairs · ${seasonLabel(d.season)}`}>
        {d.pairs.length ? (
          <SortableTable columns={UNIT_COLUMNS} rows={unitRows(d.pairs)} initialSort="toi" caption="Oilers defence pairs this season" nameLabel="Pair" minWidth="34rem" />
        ) : (
          <p className="text-sm text-fg-muted">No pair has played {d.minMinutes} minutes together yet.</p>
        )}
      </Module>
      <p className="text-xs text-fg-muted">
        Every combination with at least {d.minMinutes} minutes together at 5 on 5 this season, from who was on the ice in the NHL&apos;s shift charts.
        xGF% and CF% above 50 mean the Oilers controlled play with that group out.{" "}
        <Link href="/stats-guide" className="underline">
          What these mean
        </Link>
      </p>
    </div>
  );
}

export default async function PlayersPage() {
  const [now, last] = await Promise.all([playersData("this"), playersData("last")]);
  const lines = await linesData(now.season);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="display-hero text-5xl sm:text-6xl">Players</h1>
      <p className="mb-4 mt-1 text-fg-muted">Oilers stats, lines and roster, regular season.</p>
      <ViewTabs
        param="tab"
        label="Players view"
        defaultKey="stats"
        options={[
          { key: "stats", label: "Stats" },
          { key: "lines", label: "Lines" },
          { key: "roster", label: "Roster" },
        ]}
        panels={{
          stats: (
            <div className="mt-4">
              <ViewTabs
                param="season"
                label="Season"
                variant="segmented"
                defaultKey="this"
                options={[
                  { key: "this", label: seasonLabel(now.season) },
                  { key: "last", label: seasonLabel(last.season) },
                ]}
                panels={{ this: <SeasonTables d={now} />, last: <SeasonTables d={last} /> }}
              />
            </div>
          ),
          lines: <Lines d={lines} />,
          roster: (
            <div className="mt-6">
              <RosterCards />
            </div>
          ),
        }}
      />
    </div>
  );
}
