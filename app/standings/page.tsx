import type { Metadata } from "next";
import Link from "next/link";
import { ShareChart } from "@/components/charts/ShareChart";
import { DataError } from "@/components/data/Module";
import { SortableTable, type TableRow } from "@/components/players/SortableTable";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { ViewTabs } from "@/components/ui/ViewTabs";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { load } from "@/lib/load";
import { nhl, txt, type StandingsRow } from "@/lib/nhl";
import { conferenceTable, divisionTable, formatGameDate, pointPct, signed, streakLabel, teamOf, wildCardTable } from "@/lib/oilers";
import { formatOdds, latestOdds, oddsHistory } from "@/lib/stats/odds";
import { fillOf, oddsTone, signedTone, streakTone } from "@/lib/tone";
import { TEAM_STAT_COLUMNS, teamStatRows } from "@/lib/teamstats";

export const metadata: Metadata = { title: "Standings" };

type View = "wildcard" | "division" | "conference" | "race" | "stats";
const VIEWS: { key: View; label: string }[] = [
  { key: "division", label: "Division" },
  { key: "wildcard", label: "Wild card" },
  { key: "conference", label: "Conference" },
  { key: "race", label: "Playoff race" },
  { key: "stats", label: "Team stats" },
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
        <table className="tabular w-full min-w-[50rem] text-sm">
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
                <abbr title="Regulation wins (the first tiebreaker)">RW</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Goals for">GF</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Goals against">GA</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Goal differential">GD</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Home record: wins, losses, overtime losses">Home</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Road record: wins, losses, overtime losses">Road</abbr>
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
                    <Link href={`/team/${teamOf(r)}`} className="flex items-center gap-2 whitespace-nowrap hover:underline" title={`${txt(r.teamName)}: team scouting page`}>
                      <TeamLogo abbrev={teamOf(r)} logo={r.teamLogo} size={24} />
                      <span className="sm:hidden">{teamOf(r)}</span>
                      <span className="hidden sm:inline">{txt(r.teamCommonName)}</span>
                    </Link>
                  </th>
                  <td className="px-2 py-2 text-right">{r.gamesPlayed}</td>
                  <td className="hidden px-2 py-2 text-right sm:table-cell">{r.wins}</td>
                  <td className="hidden px-2 py-2 text-right sm:table-cell">{r.losses}</td>
                  <td className="hidden px-2 py-2 text-right sm:table-cell">{r.otLosses}</td>
                  <td className="numeral px-2 py-2 text-right">{r.points}</td>
                  <td className="px-2 py-2 text-right">{pointPct(r)}</td>
                  <td className="px-2 py-2 text-right">{r.regulationWins}</td>
                  <td className="px-2 py-2 text-right">{r.goalFor}</td>
                  <td className="px-2 py-2 text-right">{r.goalAgainst}</td>
                  <td className={`px-2 py-2 text-right ${signedTone(r.goalDifferential)}`}>{signed(r.goalDifferential)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {r.homeWins}-{r.homeLosses}-{r.homeOtLosses}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {r.roadWins}-{r.roadLosses}-{r.roadOtLosses}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <span>
                      {r.l10Wins}-{r.l10Losses}-{r.l10OtLosses}
                    </span>
                  </td>
                  <td className="px-2 py-2 pr-3 text-right">
                    <span className={streakTone(r.streakCode)}>{streakLabel(r) || "—"}</span>
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

function StandingsView({ view, rows }: { view: View; rows: StandingsRow[] }) {
  return (
    <div className="mt-6 space-y-10">
      {CONFERENCES.map((conf) => {
        if (view === "conference") {
          return <StandingsTable key={conf.abbrev} title={conf.name} rows={conferenceTable(rows, conf.abbrev)} rank={(r) => r.conferenceSequence} />;
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
        Ties are broken by the NHL&apos;s own ordering. RW = regulation wins, the first tiebreaker. On a phone, swipe the table sideways for more
        columns. Tap a team for its scouting page.
      </p>
    </div>
  );
}

/** Every team's simulated playoff odds and projected points, by conference, and the Oilers' odds over the season. */
function PlayoffRace({ rows }: { rows: StandingsRow[] }) {
  const season = rows[0]?.seasonId;
  const latest = season ? latestOdds(season) : null;
  if (!season || !latest) {
    return <p className="mt-6 text-fg-muted">Playoff odds appear after the next site update.</p>;
  }
  const odds = new Map(latest.rows.map((r) => [r.team, r]));
  const history = oddsHistory(season, "EDM");
  const early = Math.max(...rows.map((r) => r.gamesPlayed)) < 10;
  const th = "px-2 py-2 text-right font-semibold";
  return (
    <div className="mt-6 space-y-10">
      <p className="max-w-3xl text-sm text-fg-muted">
        Estimates from simulating the rest of the regular season 10,000 times, based on each team&apos;s results and expected goals this season and the
        games they have left. Green: better than even odds; red: worse.{early ? " This early, a single game moves them a lot." : ""}{" "}
        <Link href="/stats-guide#odds" className="underline">
          How the odds work
        </Link>
      </p>
      <section aria-labelledby="odds-trend" className="card p-4 sm:p-5">
        <h2 id="odds-trend" className="display text-2xl">
          Oilers&apos; playoff odds this season
        </h2>
        <p className="text-xs text-fg-muted">One point per day, after that day&apos;s last update</p>
        {history.length >= 2 ? (
          <ShareChart
            fullScale
            ariaLabel={`Oilers playoff odds over the season, now ${formatOdds(history.at(-1)!.odds)}`}
            series={[
              {
                key: "us",
                name: "Oilers",
                points: history.map((h) => ({ label: formatGameDate(h.date + "T18:00:00Z", { month: "short", day: "numeric" }), detail: `after ${h.gp} games`, value: h.odds * 100 })),
              },
            ]}
          />
        ) : (
          <p className="mt-3 text-sm text-fg-muted">The chart fills in as the season goes, one point per day.</p>
        )}
      </section>
      {CONFERENCES.map((conf) => {
        const teams = rows
          .filter((r) => r.conferenceAbbrev === conf.abbrev)
          .sort((a, b) => (odds.get(teamOf(b))?.odds ?? 0) - (odds.get(teamOf(a))?.odds ?? 0) || b.points - a.points);
        return (
          <div key={conf.abbrev} className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[26rem] text-sm">
                <caption className="display bg-header px-3 py-2 text-left text-xl text-header-fg">{conf.name}</caption>
                <thead className="bg-sunken text-[11px] uppercase tracking-wider text-fg-muted">
                  <tr>
                    <th scope="col" className="w-8 px-2 py-2 text-right font-semibold">
                      #
                    </th>
                    <th scope="col" className="sticky left-0 bg-sunken px-2 py-2 text-left font-semibold">
                      Team
                    </th>
                    <th scope="col" className={th}>
                      <abbr title="Games played">GP</abbr>
                    </th>
                    <th scope="col" className={th}>
                      <abbr title="Points">PTS</abbr>
                    </th>
                    <th scope="col" className={th}>
                      <abbr title="Projected points at the end of the regular season (average of the simulations)">Proj. PTS</abbr>
                    </th>
                    <th scope="col" className={`${th} pr-3`}>
                      Playoff odds
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((r, i) => {
                    const o = odds.get(teamOf(r));
                    const edm = teamOf(r) === "EDM";
                    return (
                      <tr key={teamOf(r)} aria-current={edm ? "true" : undefined} className={`${i ? "border-t border-line" : ""} ${edm ? "bg-sunken font-semibold" : ""}`}>
                        <td className={`px-2 py-2 text-right text-fg-muted ${edm ? "shadow-[inset_4px_0_0_var(--brand-accent)]" : ""}`}>{i + 1}</td>
                        <th scope="row" className={`sticky left-0 px-2 py-2 text-left font-normal ${edm ? "bg-sunken font-semibold" : "bg-raised"}`}>
                          <Link href={`/team/${teamOf(r)}`} className="flex items-center gap-2 whitespace-nowrap hover:underline">
                            <TeamLogo abbrev={teamOf(r)} logo={r.teamLogo} size={24} />
                            <span className="sm:hidden">{teamOf(r)}</span>
                            <span className="hidden sm:inline">{txt(r.teamCommonName)}</span>
                          </Link>
                        </th>
                        <td className="px-2 py-2 text-right">{r.gamesPlayed}</td>
                        <td className="px-2 py-2 text-right">{r.points}</td>
                        <td className="px-2 py-2 text-right">{o ? Math.round(o.projPoints) : "—"}</td>
                        <td className="px-2 py-2 pr-3 text-right">
                          {o ? (
                            <span className="inline-flex items-center justify-end gap-2">
                              <span className="relative hidden h-2 w-20 overflow-hidden rounded-full bg-sunken sm:inline-block" aria-hidden>
                                <span className={`absolute inset-y-0 left-0 rounded-full ${fillOf(oddsTone(o.odds))}`} style={{ width: `${o.odds * 100}%` }} />
                              </span>
                              <span className={`numeral w-12 text-base ${oddsTone(o.odds)}`}>{formatOdds(o.odds)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Every team's stats from "Team stats at a glance", sortable by any column, Oilers marked. */
function TeamStats({ rows }: { rows: TableRow[] }) {
  return (
    <div className="mt-6 space-y-3">
      <p className="max-w-3xl text-sm text-fg-muted">
        This season, all 32 teams. Select a column heading to sort; select it again to flip the order. Shares (xGF%, CF%, HDCF%) and PDO are 5 on 5;
        everything else is all situations. The Oilers have an orange bar.{" "}
        <Link href="/stats-guide" className="underline">
          What these mean
        </Link>
      </p>
      <div className="card p-3 sm:p-4">
        <SortableTable columns={TEAM_STAT_COLUMNS} rows={rows} initialSort="xgf" caption="Team stats for every NHL team this season" nameLabel="Team" minWidth="58rem" />
      </div>
    </div>
  );
}

export default async function StandingsPage() {
  const standings = await load(nhl.standings);
  const statRows = standings.ok && standings.data.standings.length ? await teamStatRows(standings.data.standings, standings.data.standings[0].seasonId) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">League table</p>
      <h1 className="display-hero mt-2 text-6xl sm:text-7xl">Standings</h1>
      <div className="mt-6">
        {!standings.ok ? (
          <DataError what="standings" error={standings.error} />
        ) : (
          <ViewTabs
            param="view"
            label="Standings view"
            defaultKey="division"
            options={VIEWS.map((v) => ({ key: v.key, label: v.label }))}
            extra={<LastUpdated at={standings.meta.fetchedAt} stale={standings.meta.stale} className="ml-auto" />}
            panels={Object.fromEntries(
              VIEWS.map((v) => [
                v.key,
                v.key === "race" ? (
                  <PlayoffRace key={v.key} rows={standings.data.standings} />
                ) : v.key === "stats" ? (
                  <TeamStats key={v.key} rows={statRows} />
                ) : (
                  <StandingsView key={v.key} view={v.key} rows={standings.data.standings} />
                ),
              ]),
            )}
          />
        )}
      </div>
    </div>
  );
}
