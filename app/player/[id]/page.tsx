import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TrendChart, type TrendPoint } from "@/components/charts/TrendChart";
import { Headshot } from "@/components/ui/Headshot";
import { DataError, Module } from "@/components/data/Module";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Rivets } from "@/components/ui/Rivets";
import { Spoiler } from "@/components/ui/Spoiler";
import { load } from "@/lib/load";
import { nhl, txt, type GameLogEntry, type PlayerLanding, type SeasonTotal, type StatLine } from "@/lib/nhl";
import { previousSeason } from "@/lib/nhl/endpoints";
import { age, formatGameDate, gaa, heightFtIn, savePct, seasonShort, signed } from "@/lib/oilers";

const POSITION: Record<string, string> = { C: "Centre", L: "Left wing", R: "Right wing", D: "Defence", G: "Goalie" };
const RECENT_MS = 36 * 3600 * 1000;
/** NHL goalie decisions: W, L, and O for an overtime/shootout loss. */
const DECISION: Record<string, string> = { W: "W", L: "L", O: "OTL" };
const isRecent = (gameDate: string) => Date.now() - Date.parse(gameDate + "T12:00:00Z") < RECENT_MS;

export async function generateMetadata({ params }: PageProps<"/player/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = /^\d{7}$/.test(id) ? await load(() => nhl.player(Number(id))) : null;
  return { title: p?.ok ? `${txt(p.data.firstName)} ${txt(p.data.lastName)}` : "Player" };
}

type Col<T> = { key: string; label: string; title: string; value: (s: T) => React.ReactNode; strong?: boolean };

const SKATER_COLS: Col<StatLine>[] = [
  { key: "gp", label: "GP", title: "Games played", value: (s) => s.gamesPlayed ?? 0 },
  { key: "g", label: "G", title: "Goals", value: (s) => s.goals ?? 0 },
  { key: "a", label: "A", title: "Assists", value: (s) => s.assists ?? 0 },
  { key: "p", label: "P", title: "Points", value: (s) => s.points ?? 0, strong: true },
  { key: "pm", label: "+/-", title: "Plus/minus", value: (s) => signed(s.plusMinus) },
  { key: "pim", label: "PIM", title: "Penalty minutes", value: (s) => s.pim ?? 0 },
  { key: "sog", label: "SOG", title: "Shots on goal", value: (s) => s.shots ?? 0 },
  { key: "sp", label: "S%", title: "Shooting percentage", value: (s) => (s.shootingPctg === undefined ? "—" : (s.shootingPctg * 100).toFixed(1)) },
  { key: "ppp", label: "PPP", title: "Power-play points", value: (s) => s.powerPlayPoints ?? 0 },
];

const GOALIE_COLS: Col<StatLine>[] = [
  { key: "gp", label: "GP", title: "Games played", value: (s) => s.gamesPlayed ?? 0 },
  { key: "w", label: "W", title: "Wins", value: (s) => s.wins ?? 0, strong: true },
  { key: "l", label: "L", title: "Losses", value: (s) => s.losses ?? 0 },
  { key: "otl", label: "OTL", title: "Overtime losses", value: (s) => s.otLosses ?? 0 },
  { key: "gaa", label: "GAA", title: "Goals-against average", value: (s) => gaa(s.goalsAgainstAvg) },
  { key: "sv", label: "SV%", title: "Save percentage", value: (s) => savePct(s.savePctg), strong: true },
  { key: "so", label: "SO", title: "Shutouts", value: (s) => s.shutouts ?? 0 },
];

function StatTiles({ stats, cols }: { stats: StatLine; cols: Col<StatLine>[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
      {cols.map((c) => (
        <div key={c.key} className={`rounded-md px-2 py-2 text-center ${c.strong ? "bg-header text-header-fg" : "bg-sunken"}`}>
          <dt className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
            <abbr title={c.title} className="no-underline">
              {c.label}
            </abbr>
          </dt>
          <dd className="numeral text-2xl">{c.value(stats)}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatTable<T>({ rows, cols, first, caption }: { rows: T[]; cols: Col<T>[]; first: Col<T>[]; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[32rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-sunken text-[11px] uppercase tracking-wider text-fg-muted">
          <tr>
            {[...first, ...cols].map((c, i) => (
              <th key={c.key} scope="col" className={`px-2 py-2 font-semibold ${i < first.length ? "text-left" : "text-right"}`}>
                <abbr title={c.title} className="no-underline">
                  {c.label}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-line">
              {[...first, ...cols].map((c, i) => (
                <td key={c.key} className={`px-2 py-1.5 ${i < first.length ? "whitespace-nowrap text-left" : "text-right"} ${c.strong ? "numeral" : ""}`}>
                  {c.value(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Blur only when the content could spoil a game from the last day and a half. */
function MaybeSpoiler({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? (
    <Spoiler label="recent form" as="div">
      {children}
    </Spoiler>
  ) : (
    <div>{children}</div>
  );
}

function trendFor(log: GameLogEntry[], goalie: boolean): { points: TrendPoint[]; summary: string } {
  const recent = [...log].sort((a, b) => a.gameDate.localeCompare(b.gameDate)).slice(-10);
  if (goalie) {
    const played = recent.filter((g) => (g.shotsAgainst ?? 0) > 0);
    const sa = played.reduce((s, g) => s + (g.shotsAgainst ?? 0), 0);
    const ga = played.reduce((s, g) => s + (g.goalsAgainst ?? 0), 0);
    return {
      points: played.map((g) => ({
        label: formatGameDate(g.gameDate + "T18:00:00Z", { month: "short", day: "numeric" }),
        opponent: `${g.homeRoadFlag === "H" ? "vs" : "@"} ${g.opponentAbbrev}`,
        value: g.savePctg ?? 0,
        detail: `${DECISION[g.decision ?? ""] ?? "No decision"} · ${savePct(g.savePctg)} · ${g.goalsAgainst ?? 0} GA on ${g.shotsAgainst ?? 0} shots`,
      })),
      summary: played.length ? `Last ${played.length}: ${savePct(sa ? (sa - ga) / sa : undefined)} SV% · ${ga} GA` : "",
    };
  }
  const g = recent.reduce((s, x) => s + (x.goals ?? 0), 0);
  const a = recent.reduce((s, x) => s + (x.assists ?? 0), 0);
  return {
    points: recent.map((x) => ({
      label: formatGameDate(x.gameDate + "T18:00:00Z", { month: "short", day: "numeric" }),
      opponent: `${x.homeRoadFlag === "H" ? "vs" : "@"} ${x.opponentAbbrev}`,
      value: x.points ?? 0,
      detail: `${x.goals ?? 0} G · ${x.assists ?? 0} A · ${x.shots ?? 0} SOG · ${x.toi ?? ""} TOI`,
    })),
    summary: recent.length ? `Last ${recent.length}: ${g} G · ${a} A · ${g + a} PTS` : "",
  };
}

function nhlSeasons(p: PlayerLanding, gameType: 2 | 3): SeasonTotal[] {
  return (p.seasonTotals ?? []).filter((s) => s.leagueAbbrev === "NHL" && s.gameTypeId === gameType).sort((a, b) => b.season - a.season || (a.sequence ?? 0) - (b.sequence ?? 0));
}

export default async function PlayerPage({ params }: PageProps<"/player/[id]">) {
  await connection();
  const { id } = await params;
  if (!/^\d{7}$/.test(id)) notFound();
  const playerId = Number(id);

  const player = await load(() => nhl.player(playerId));
  if (!player.ok) {
    if (player.notFound && !player.error.includes("fixtures:capture")) notFound();
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="display-hero text-5xl">Player {id}</h1>
        <div className="mt-6">
          <DataError what="this player" error={player.error} />
        </div>
        <Link href="/roster" className="btn btn-secondary mt-6">
          Back to roster
        </Link>
      </div>
    );
  }

  const p = player.data;
  const goalie = p.position === "G";
  const cols = goalie ? GOALIE_COLS : SKATER_COLS;
  const featured = p.featuredStats;
  const season = featured?.season;
  const seasonStats = featured?.regularSeason?.subSeason;
  const playoffStats = featured?.playoffs?.subSeason;

  // Game log for the featured season; fall back a season if it's empty.
  let log = season ? await load(() => nhl.gameLog(playerId, season, 2)) : null;
  let logSeason = season;
  if (season && log?.ok && log.data.gameLog.length === 0) {
    const prev = previousSeason(season);
    const older = await load(() => nhl.gameLog(playerId, prev, 2));
    if (older.ok && older.data.gameLog.length) {
      log = older;
      logSeason = prev;
    }
  }
  const games = log?.ok ? [...log.data.gameLog].sort((a, b) => b.gameDate.localeCompare(a.gameDate)) : [];

  // The trend always covers the last 10 NHL games, reaching back into last season early on.
  let trendGames = games;
  if (logSeason && games.length < 10) {
    const prev = await load(() => nhl.gameLog(playerId, previousSeason(logSeason), 2));
    if (prev.ok) trendGames = [...games, ...prev.data.gameLog];
  }
  const trend = trendFor(trendGames, goalie);
  const spansSeasons = [...trendGames]
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate))
    .slice(0, 10)
    .some((g) => !games.includes(g));

  const bio: [string, string][] = [
    ["Position", POSITION[p.position] ?? p.position],
    ...(p.birthDate
      ? ([["Born", `${new Date(p.birthDate + "T12:00:00Z").toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })} (age ${age(p.birthDate)})`]] as [string, string][])
      : []),
    ...(p.birthCity ? ([["Birthplace", [txt(p.birthCity), txt(p.birthStateProvince), p.birthCountry].filter(Boolean).join(", ")]] as [string, string][]) : []),
    ...(p.heightInInches ? ([["Height", `${heightFtIn(p.heightInInches)} (${p.heightInCentimeters} cm)`]] as [string, string][]) : []),
    ...(p.weightInPounds ? ([["Weight", `${p.weightInPounds} lb (${p.weightInKilograms} kg)`]] as [string, string][]) : []),
    ...(p.shootsCatches ? ([[goalie ? "Catches" : "Shoots", p.shootsCatches === "L" ? "Left" : "Right"]] as [string, string][]) : []),
    ...(p.draftDetails
      ? ([["Draft", `${p.draftDetails.year} ${p.draftDetails.teamAbbrev}, round ${p.draftDetails.round}, #${p.draftDetails.overallPick} overall`]] as [string, string][])
      : ([["Draft", "Undrafted"]] as [string, string][])),
  ];

  const logFirst: Col<GameLogEntry>[] = [
    { key: "date", label: "Date", title: "Date", value: (g) => formatGameDate(g.gameDate + "T18:00:00Z", { month: "short", day: "numeric" }) },
    { key: "opp", label: "Opp", title: "Opponent", value: (g) => `${g.homeRoadFlag === "H" ? "vs" : "@"} ${g.opponentAbbrev}` },
  ];
  const logCols: Col<GameLogEntry>[] = goalie
    ? [
        { key: "dec", label: "Dec", title: "Decision", value: (g) => DECISION[g.decision ?? ""] ?? "—" },
        { key: "sa", label: "SA", title: "Shots against", value: (g) => g.shotsAgainst ?? 0 },
        { key: "ga", label: "GA", title: "Goals against", value: (g) => g.goalsAgainst ?? 0 },
        { key: "sv", label: "SV%", title: "Save percentage", value: (g) => savePct(g.savePctg), strong: true },
        { key: "toi", label: "TOI", title: "Time on ice", value: (g) => g.toi ?? "—" },
      ]
    : [
        { key: "g", label: "G", title: "Goals", value: (g) => g.goals ?? 0 },
        { key: "a", label: "A", title: "Assists", value: (g) => g.assists ?? 0 },
        { key: "p", label: "P", title: "Points", value: (g) => g.points ?? 0, strong: true },
        { key: "pm", label: "+/-", title: "Plus/minus", value: (g) => signed(g.plusMinus) },
        { key: "sog", label: "SOG", title: "Shots on goal", value: (g) => g.shots ?? 0 },
        { key: "ppp", label: "PPP", title: "Power-play points", value: (g) => g.powerPlayPoints ?? 0 },
        { key: "toi", label: "TOI", title: "Time on ice", value: (g) => g.toi ?? "—" },
      ];
  // Spoiler-free: wrap the stat cells of games from the last day and a half.
  const spoilerCols: Col<GameLogEntry>[] = logCols.map((c) => ({
    ...c,
    value: (g: GameLogEntry) => (isRecent(g.gameDate) ? <Spoiler label="game stats">{c.value(g)}</Spoiler> : c.value(g)),
  }));
  const recentGame = games.length > 0 && isRecent(games[0].gameDate);

  const seasonCols: Col<SeasonTotal>[] = cols as unknown as Col<SeasonTotal>[];
  const seasonFirst: Col<SeasonTotal>[] = [
    { key: "season", label: "Season", title: "Season", value: (s) => seasonShort(s.season) },
    { key: "team", label: "Team", title: "Team", value: (s) => txt(s.teamCommonName) || txt(s.teamName) },
  ];
  const regSeasons = nhlSeasons(p, 2);
  const career = p.careerTotals;

  return (
    <div>
      {/* Header: the back of the sweater */}
      <div className="relative isolate overflow-hidden bg-header text-header-fg">
        <span aria-hidden className="numeral pointer-events-none absolute -bottom-10 right-0 -z-10 text-[14rem] leading-none opacity-10 sm:text-[20rem]">
          {p.sweaterNumber}
        </span>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-6 px-4 pb-8 pt-10 sm:px-6">
          {p.headshot && <Headshot src={p.headshot} />}
          <div>
            <p className="numeral text-lg tracking-widest text-header-accent">
              #{p.sweaterNumber ?? "—"} · {POSITION[p.position] ?? p.position}
              {p.currentTeamAbbrev && ` · ${p.currentTeamAbbrev}`}
            </p>
            <h1 className="display-hero leading-[0.85]">
              <span className="block text-3xl opacity-85 sm:text-4xl">{txt(p.firstName)}</span>
              <span className="block text-6xl sm:text-8xl">{txt(p.lastName)}</span>
            </h1>
            <Rivets className="mt-3 text-header-accent" />
          </div>
        </div>
        <div className="sleeve-stripes" aria-hidden />
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Module title={season ? `${seasonShort(season)} regular season` : "This season"} meta={player.meta}>
            {seasonStats ? (
              <Spoiler label="season stats" as="div">
                <StatTiles stats={seasonStats} cols={cols} />
              </Spoiler>
            ) : (
              <p className="text-fg-muted">No NHL games this season yet.</p>
            )}
            {playoffStats && (
              <p className="mt-3 text-sm text-fg-muted">
                Playoffs {season && seasonShort(season)}:{" "}
                {goalie
                  ? `${playoffStats.wins ?? 0}-${playoffStats.losses ?? 0} · ${savePct(playoffStats.savePctg)} SV% · ${gaa(playoffStats.goalsAgainstAvg)} GAA`
                  : `${playoffStats.gamesPlayed ?? 0} GP · ${playoffStats.goals ?? 0} G · ${playoffStats.assists ?? 0} A · ${playoffStats.points ?? 0} PTS`}
              </p>
            )}
          </Module>

          <Module title="Bio" meta={player.meta}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {bio.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-fg-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Module>
        </div>

        <Module title={goalie ? "Save percentage, last 10 games" : "Points, last 10 games"} meta={log?.ok ? log.meta : undefined}>
          {!log ? (
            <p className="text-fg-muted">No season to show.</p>
          ) : !log.ok ? (
            <DataError what="the game log" error={log.error} />
          ) : trend.points.length < 2 ? (
            <p className="text-fg-muted">Not enough games yet for a trend.</p>
          ) : (
            <MaybeSpoiler on={recentGame}>
              <p className="text-sm text-fg-muted">
                {trend.summary}
                {spansSeasons ? " · includes last season" : logSeason && logSeason !== season ? ` · ${seasonShort(logSeason)}` : ""}
              </p>
              <TrendChart
                data={trend.points}
                yDomain={goalie ? [0.8, 1] : [0, Math.max(3, ...trend.points.map((d) => d.value))]}
                yTicks={
                  goalie
                    ? [0.8, 0.85, 0.9, 0.95, 1]
                    : Array.from({ length: Math.max(3, ...trend.points.map((d) => d.value)) + 1 }, (_, i) => i)
                }
                yFormat={goalie ? "savePct" : "int"}
                ariaLabel={`${goalie ? "Save percentage" : "Points"} in each of the last ${trend.points.length} games. ${trend.summary}. Full numbers are in the game log table.`}
              />
            </MaybeSpoiler>
          )}
        </Module>

        <Module title={`Game log${logSeason ? ` · ${seasonShort(logSeason)}` : ""}`} meta={log?.ok ? log.meta : undefined}>
          {!log ? null : !log.ok ? (
            <DataError what="the game log" error={log.error} />
          ) : games.length === 0 ? (
            <p className="text-fg-muted">No games yet.</p>
          ) : (
            <StatTable rows={games} cols={spoilerCols} first={logFirst} caption="Game log, most recent first" />
          )}
        </Module>

        <Module title="Career" meta={player.meta}>
          {career?.regularSeason || career?.playoffs ? (
            <StatTable
              rows={[
                ...(career.regularSeason ? [{ ...career.regularSeason, _label: "Regular season" }] : []),
                ...(career.playoffs ? [{ ...career.playoffs, _label: "Playoffs" }] : []),
              ]}
              cols={cols}
              first={[{ key: "kind", label: "NHL career", title: "Career totals", value: (s) => (s as { _label: string })._label }]}
              caption="NHL career totals"
            />
          ) : (
            <p className="text-fg-muted">No NHL career totals yet.</p>
          )}
          {regSeasons.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold">Season by season ({regSeasons.length})</summary>
              <div className="mt-2">
                <StatTable rows={regSeasons} cols={seasonCols} first={seasonFirst} caption="NHL regular season by season" />
              </div>
            </details>
          )}
        </Module>

        <p className="text-sm text-fg-muted">
          Posts about this player arrive with the blog in Phase 8. <LastUpdated at={player.meta.fetchedAt} stale={player.meta.stale} />
        </p>
      </div>
    </div>
  );
}
