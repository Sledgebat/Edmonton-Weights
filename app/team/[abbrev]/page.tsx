import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DataError } from "@/components/data/Module";
import { GoalieList, Heat, RecentPerformance, SectionHeading, StatTiles, TileCard } from "@/components/home/Sections";
import { Comebacks, GoalieStarts, GoalsByPeriod, HowTheyScore, LuckMeter, MoreRecords, PersonalityCard, SituationRecords, SpecialTeams, StolenGames } from "@/components/team/InDepth";
import { ViewTabs } from "@/components/ui/ViewTabs";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { load } from "@/lib/load";
import { nhl, txt } from "@/lib/nhl";
import { TEAM, seasonLabel } from "@/lib/nhl/endpoints";
import { ordinal, pointPct, signed, streakLabel, teamOf } from "@/lib/oilers";
import { formatOdds } from "@/lib/stats/odds";
import { oddsTone, signedTone, streakTone } from "@/lib/tone";
import { teamAbbrevs, teamPageData, type TeamPageData } from "@/lib/team";

export const dynamicParams = false;

/** A scouting page for every team in the standings. */
export async function generateStaticParams() {
  const abbrevs = await teamAbbrevs();
  return (abbrevs.length ? abbrevs : [TEAM]).map((abbrev) => ({ abbrev }));
}

/** "Oilers Season In-Depth" for Edmonton, "[Team name] Season In-Depth" for everyone else. */
function pageTitle(abbrev: string, name: string | null) {
  return abbrev === TEAM ? "Oilers Season In-Depth" : `${name ?? abbrev} Season In-Depth`;
}

export async function generateMetadata({ params }: PageProps<"/team/[abbrev]">): Promise<Metadata> {
  const { abbrev } = await params;
  const standings = await load(nhl.standings);
  const row = standings.ok ? standings.data.standings.find((r) => teamOf(r) === abbrev) : undefined;
  return {
    title: pageTitle(abbrev, row ? txt(row.teamName) : null),
    description: `How the ${row ? txt(row.teamName) : abbrev} are really doing this season: records by situation, luck, special teams, how they score and their goaltending.`,
  };
}

function RecordCards({ d }: { d: TeamPageData }) {
  const r = d.row;
  const p = d.picture;
  if (!d.standings.ok) return <DataError what="the standings" error={d.standings.error} />;
  if (!r) return <p className="text-fg-muted">This team isn&apos;t in the current standings.</p>;
  const items: [string, string, string?][] = [
    ["Record", `${r.wins}-${r.losses}-${r.otLosses}`],
    ["Points", String(r.points)],
    ["Point %", pointPct(r)],
    ["Goal diff", signed(r.goalDifferential), signedTone(r.goalDifferential)],
    ["Last 10", `${r.l10Wins}-${r.l10Losses}-${r.l10OtLosses}`],
    ["Streak", streakLabel(r) || "—", streakTone(r.streakCode)],
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(([k, v, tone]) => (
          <div key={k} className="card px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{k}</dt>
            <dd className={`numeral mt-0.5 text-2xl leading-tight sm:text-3xl ${tone ?? ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {p && (
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          {d.odds && (
            <div className="text-center">
              <p className={`numeral text-5xl leading-none ${oddsTone(d.odds.odds)}`}>{formatOdds(d.odds.odds)}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Playoff odds</p>
            </div>
          )}
          <div className="text-center">
            <p className="numeral text-5xl leading-none">{p.pace}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Points pace</p>
          </div>
          <p className="text-sm">
            {ordinal(r.divisionSequence)} in the {r.divisionName}, {ordinal(r.conferenceSequence)} in the {r.conferenceName}.{" "}
            {p.inPlayoffSpot ? `Holding a playoff spot (${p.spot})` : "Outside the playoff spots"}
            {p.rival
              ? `, ${Math.abs(p.cushion)} ${Math.abs(p.cushion) === 1 ? "point" : "points"} ${p.cushion >= 0 ? "ahead of" : "behind"} ${p.rival.team}.`
              : "."}{" "}
            <span className="text-fg-muted">
              Pace = points per game over {p.seasonGames} games.
              {d.odds && (
                <>
                  {" "}
                  Odds: an estimate from 10,000 simulations of the rest of the season (projected {Math.round(d.odds.projPoints)} points).{" "}
                  <Link href="/standings?view=race" className="underline">
                    Playoff race
                  </Link>
                </>
              )}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function Shooters({ d }: { d: TeamPageData }) {
  if (d.shooters.length === 0) return <p className="text-sm text-fg-muted">No shots stored for this team yet this season.</p>;
  const th = "px-2 py-2 text-right font-semibold";
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[30rem] text-sm">
          <caption className="sr-only">
            {d.name} players with the most individual expected goals, {seasonLabel(d.season)}
          </caption>
          <thead className="bg-sunken text-[11px] uppercase tracking-wider text-fg-muted">
            <tr>
              <th scope="col" className="w-8 px-2 py-2 text-right font-semibold">
                #
              </th>
              <th scope="col" className="sticky left-0 bg-sunken px-2 py-2 text-left font-semibold">
                Player
              </th>
              <th scope="col" className={th}>
                <abbr title="Games played">GP</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Goals">G</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Points">P</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Shots on goal">SOG</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Individual expected goals: the quality of the player's own shots">ixG</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="High-danger chances taken">HD</abbr>
              </th>
              <th scope="col" className={`${th} pr-3`}>
                <abbr title="Goals minus individual expected goals: above zero means finishing better than expected">G−ixG</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {d.shooters.map((s, i) => {
              const gax = s.goals - s.ixg;
              return (
                <tr key={s.id} className={i ? "border-t border-line" : ""}>
                  <td className="px-2 py-2 text-right text-fg-muted">{i + 1}</td>
                  <th scope="row" className="sticky left-0 bg-raised px-2 py-2 text-left font-semibold">
                    <Link href={s.href} className="whitespace-nowrap hover:underline">
                      {s.name}
                    </Link>
                    {s.pos && <span className="ml-1.5 text-xs font-normal text-fg-muted">{s.pos}</span>}
                  </th>
                  <td className="px-2 py-2 text-right">{s.gp ?? "—"}</td>
                  <td className="px-2 py-2 text-right">{s.goals}</td>
                  <td className="px-2 py-2 text-right">{s.points ?? "—"}</td>
                  <td className="px-2 py-2 text-right">{s.shots}</td>
                  <td className="numeral px-2 py-2 text-right">{s.ixg.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right">{s.hd}</td>
                  <td className={`px-2 py-2 pr-3 text-right ${signedTone(gax, 1)}`}>
                    {gax > 0 ? "+" : ""}
                    {gax.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "situations", label: "Situations" },
  { key: "scoring", label: "Scoring" },
  { key: "goaltending", label: "Goaltending" },
];

/** Season In-Depth: how any NHL team is doing this season, and why, in tabs. */
export default async function TeamPage({ params }: PageProps<"/team/[abbrev]">) {
  const { abbrev } = await params;
  if (!/^[A-Z]{3}$/.test(abbrev)) notFound();
  const d = await teamPageData(abbrev);
  const us = abbrev === TEAM;
  const side = us ? "us" : "them";
  const heatMax = d.heat ? Math.max(d.heat.for.max, d.heat.against.max) : 1;
  const tilesNote = `${seasonLabel(d.season)} · league rank · arrows compare the last 10 games with the season`;

  const overview = (
    <div className="space-y-10">
      <section aria-labelledby="record">
        <SectionHeading id="record" title="Record" />
        <RecordCards d={d} />
        <MoreRecords d={d} />
        {d.standings.ok && <LastUpdated at={d.standings.meta.fetchedAt} stale={d.standings.meta.stale} className="mt-2 block text-right" />}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[2fr_3fr]">
        <PersonalityCard d={d} />
        <LuckMeter d={d} />
      </div>

      <section aria-labelledby="tiles">
        <SectionHeading id="tiles" title="Team stats" note={tilesNote} />
        {d.ranksNote && d.advancedTiles.length > 0 && <p className="-mt-2 mb-3 text-sm text-fg-muted">{d.ranksNote}</p>}
        {d.advancedTiles.length ? (
          <div className="space-y-5">
            <StatTiles d={d} />
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-fg-muted">The two halves of PDO</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {d.pdoTiles.map((t) => (
                  <TileCard key={t.key} t={t} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">No games stored for this team yet this season.</p>
        )}
        {d.updated.stats && <LastUpdated at={d.updated.stats} className="mt-2 block text-right" />}
      </section>

      <section aria-labelledby="recent">
        <SectionHeading id="recent" title="Recent form" note="Last 10 games, oldest first" />
        <RecentPerformance d={d} team={d.shortName} side={side} hasGamePage={(g) => us || g.opponent === TEAM} />
      </section>
    </div>
  );

  const situations = (
    <div className="space-y-4">
      <SituationRecords d={d} />
      <Comebacks d={d} />
      <GoalsByPeriod d={d} />
      <SpecialTeams d={d} />
    </div>
  );

  const scoring = (
    <div className="space-y-10">
      <HowTheyScore d={d} />
      {d.heat && (
        <section aria-labelledby="heat">
          <SectionHeading id="heat" title="Where the chances come from" />
          <div className="card p-4 sm:p-5">
            <p className="text-xs text-fg-muted">
              Shaded areas are where the {d.shortName} create or allow more dangerous chances than an average NHL team, {seasonLabel(d.season)}. Darker =
              further above average; blank = average or below. Net at the top.
            </p>
            <div className="mx-auto mt-3 grid max-w-xl grid-cols-2 gap-4">
              <Heat title={`${d.shortName} create`} map={d.heat.for} max={heatMax} side={side} />
              <Heat title={`${d.shortName} allow`} map={d.heat.against} max={heatMax} side={side} />
            </div>
          </div>
        </section>
      )}
      <section aria-labelledby="shooters">
        <SectionHeading id="shooters" title="Most dangerous shooters" note={`${seasonLabel(d.season)} · top ${d.shooters.length || 10} by individual expected goals (ixG), all situations`} />
        <Shooters d={d} />
      </section>
    </div>
  );

  const goaltending = (
    <div className="space-y-4">
      <section aria-labelledby="goalies" className="card p-4 sm:p-5">
        <h3 id="goalies" className="display text-2xl">
          Goalies
        </h3>
        <p className="mt-0.5 text-xs text-fg-muted">{seasonLabel(d.season)} · everyone on the roster</p>
        <div className="mt-3 max-w-xl">
          <GoalieList goalies={d.goalies} team={d.shortName} />
        </div>
      </section>
      <GoalieStarts d={d} />
      <StolenGames d={d} />
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <Link href="/standings" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:underline">
          <ArrowLeft size={14} aria-hidden /> Standings
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <TeamLogo abbrev={abbrev} size={64} />
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Season In-Depth</p>
            <h1 className="display-hero mt-1 text-5xl sm:text-6xl">{d.name}</h1>
            <p className="mt-1 text-sm text-fg-muted">
              {d.row ? `${d.row.divisionName} Division · ` : ""}
              {seasonLabel(d.season)} regular season
            </p>
          </div>
        </div>
        {d.seasonNote && <p className="mt-4 text-sm text-fg-muted">{d.seasonNote}</p>}
      </header>

      <ViewTabs
        param="tab"
        label="Season In-Depth sections"
        defaultKey="overview"
        options={TABS}
        panels={{
          overview: <div className="mt-6">{overview}</div>,
          situations: <div className="mt-6">{situations}</div>,
          scoring: <div className="mt-6">{scoring}</div>,
          goaltending: <div className="mt-6">{goaltending}</div>,
        }}
      />
    </div>
  );
}
