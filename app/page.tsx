import Link from "next/link";
import { connection } from "next/server";
import { Radio, Tv } from "lucide-react";
import { DataError, Module } from "@/components/data/Module";
import { ResultBadge } from "@/components/data/ResultBadge";
import { Countdown } from "@/components/ui/Countdown";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Rivets } from "@/components/ui/Rivets";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { load } from "@/lib/load";
import { nhl, txt, type ScheduleGame, type StandingsRow } from "@/lib/nhl";
import { edmontonDate } from "@/lib/nhl/resources";
import {
  GAME_TYPE_LABEL,
  formatGameDate,
  formatGameTime,
  formatRecord,
  lastGame,
  liveGame,
  nextGame,
  ordinal,
  pointPct,
  record,
  streakLabel,
  teamOf,
  teamView,
  topScorers,
  wildCardTable,
} from "@/lib/oilers";

const PERIOD = (n?: number) => (!n ? "" : n <= 3 ? `${ordinal(n)} period` : n === 4 ? "Overtime" : "Shootout");

function recordOf(rows: StandingsRow[] | undefined, abbrev: string) {
  const r = rows?.find((x) => teamOf(x) === abbrev);
  return r ? `${r.wins}-${r.losses}-${r.otLosses}` : undefined;
}

function NextGameHero({ game, standings }: { game: ScheduleGame; standings?: StandingsRow[] }) {
  const v = teamView(game);
  const isToday = edmontonDate(new Date(game.startTimeUTC)) === edmontonDate();
  const tv = (game.tvBroadcasts ?? []).filter((b) => b.countryCode === "CA" || b.market === "N").map((b) => b.network);
  const side = (t: typeof v.us, label: string) => (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamLogo abbrev={t.abbrev} logo={t.logo} darkLogo={t.darkLogo} size={72} />
      <div>
        <p className="display text-3xl leading-none sm:text-4xl">{txt(t.commonName, t.abbrev)}</p>
        <p className="mt-1 text-xs uppercase tracking-widest text-header-fg/75">
          {label}
          {recordOf(standings, t.abbrev) ? ` · ${recordOf(standings, t.abbrev)}` : ""}
        </p>
      </div>
    </div>
  );
  const away = v.isHome ? v.opp : v.us;
  const home = v.isHome ? v.us : v.opp;

  return (
    <div className="relative overflow-hidden rounded-xl bg-header text-header-fg shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 text-sm">
        <span className="numeral uppercase tracking-widest">
          {v.live ? (
            <span className="inline-flex items-center gap-2 text-header-accent">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" aria-hidden /> Live now
            </span>
          ) : isToday ? (
            <span className="text-header-accent">Game day</span>
          ) : (
            "Next game"
          )}
          {game.gameType !== 2 && <span className="ml-2 opacity-75">· {GAME_TYPE_LABEL[game.gameType]}</span>}
        </span>
        <Rivets className="text-header-accent" size={5} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-6 sm:px-8">
        {side(away, "Away")}
        <div className="text-center">
          {v.live ? (
            <span className="numeral block text-5xl leading-none sm:text-6xl">
              {away.score ?? 0}–{home.score ?? 0}
            </span>
          ) : (
            <p className="display-hero text-4xl text-header-accent sm:text-5xl">{v.isHome ? "vs" : "@"}</p>
          )}
          {v.live && <p className="mt-1 text-xs uppercase tracking-widest opacity-80">{PERIOD(game.periodDescriptor?.number)}</p>}
        </div>
        {side(home, "Home")}
      </div>

      <div className="sleeve-stripes-thin" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-4 bg-black/15 px-5 py-4">
        <div className="text-sm">
          <p className="font-semibold">
            {formatGameDate(game.startTimeUTC, { weekday: "long", month: "long", day: "numeric" })} ·{" "}
            {formatGameTime(game.startTimeUTC)} MT
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 opacity-80">
            {txt(game.venue)}
            {tv.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Tv size={14} aria-hidden /> {tv.join(", ")}
              </span>
            )}
          </p>
        </div>
        {v.live || isToday ? (
          <Link href={`/game/${game.id}`} className="btn btn-primary">
            <Radio size={16} aria-hidden /> Game page
          </Link>
        ) : (
          <p className="text-2xl sm:text-3xl">
            <Countdown to={game.startTimeUTC} />
          </p>
        )}
      </div>
    </div>
  );
}

export default async function Home() {
  await connection();
  const [schedule, standings, stats] = await Promise.all([load(nhl.schedule), load(nhl.standings), load(nhl.clubStats)]);

  const games = schedule.ok ? schedule.data.games : [];
  const live = liveGame(games);
  const next = live ?? nextGame(games);
  const last = lastGame(games);
  const lastView = last ? teamView(last) : undefined;
  const rows = standings.ok ? standings.data.standings : undefined;
  const edm = rows?.find((r) => teamOf(r) === "EDM");
  const regRecord = record(games, 2);

  let wildCardNote = "";
  if (rows && edm) {
    const wc = wildCardTable(rows, edm.conferenceAbbrev);
    const wcIndex = wc.wildCard.findIndex((r) => teamOf(r) === "EDM");
    wildCardNote =
      wcIndex === -1
        ? "In a division playoff spot"
        : wcIndex < wc.cutAfter
          ? `Holds wild card ${wcIndex + 1}`
          : `${wcIndex - wc.cutAfter + 1} back of the wild card line`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="sr-only">EdmontonWeights: Edmonton Oilers stats</h1>

      {/* Next / live game */}
      {!schedule.ok ? (
        <Module title="Next game">
          <DataError what="the schedule" error={schedule.error} />
        </Module>
      ) : next ? (
        <div>
          <NextGameHero game={next} standings={rows} />
          <LastUpdated at={schedule.meta.fetchedAt} stale={schedule.meta.stale} className="mt-2 block text-right" />
        </div>
      ) : (
        <Module title="Next game" meta={schedule.meta}>
          <p className="text-fg-muted">No upcoming games on the schedule. Enjoy the off-season.</p>
        </Module>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Last result */}
        <Module
          title="Last result"
          meta={schedule.ok ? schedule.meta : undefined}
          action={
            last ? (
              <Link href={`/game/${last.id}`} className="text-sm font-semibold text-accent-ink underline">
                Recap
              </Link>
            ) : undefined
          }
        >
          {!schedule.ok ? (
            <DataError what="results" error={schedule.error} />
          ) : !last || !lastView ? (
            <p className="text-fg-muted">No games played yet.</p>
          ) : (
            <div>
              <p className="text-sm text-fg-muted">
                {formatGameDate(last.startTimeUTC)} · {lastView.prefix} {txt(lastView.opp.commonName, lastView.opp.abbrev)}
                {last.gameType !== 2 && ` · ${GAME_TYPE_LABEL[last.gameType]}`}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <TeamLogo abbrev={lastView.opp.abbrev} logo={lastView.opp.logo} darkLogo={lastView.opp.darkLogo} size={44} />
                <p className="numeral text-5xl leading-none">
                  {lastView.us.score}–{lastView.opp.score}
                </p>
                <div className="flex flex-col items-start gap-1">
                  {lastView.outcome && <ResultBadge outcome={lastView.outcome} />}
                  {lastView.decidedIn !== "REG" && <span className="text-xs font-semibold text-fg-muted">{lastView.decidedIn}</span>}
                </div>
              </div>
              {last.winningGoalScorer && (
                <div className="mt-3 text-sm text-fg-muted">
                  Winner: {txt(last.winningGoalScorer.firstInitial)} {txt(last.winningGoalScorer.lastName)}
                  {last.winningGoalie && ` · Win in goal: ${txt(last.winningGoalie.firstInitial)} ${txt(last.winningGoalie.lastName)}`}
                </div>
              )}
            </div>
          )}
        </Module>

        {/* Standing */}
        <Module
          title="Division"
          meta={standings.ok ? standings.meta : undefined}
          action={
            <Link href="/standings" className="text-sm font-semibold text-accent-ink underline">
              Standings
            </Link>
          }
        >
          {!standings.ok ? (
            <DataError what="standings" error={standings.error} />
          ) : !edm ? (
            <p className="text-fg-muted">The Oilers aren&apos;t in the current standings.</p>
          ) : (
            <div>
              <div>
                <p className="display text-5xl leading-none">
                  {ordinal(edm.divisionSequence)} <span className="text-fg-muted">in the {edm.divisionName}</span>
                </p>
                <p className="mt-2 text-sm text-fg-muted">
                  {ordinal(edm.conferenceSequence)} in the {edm.conferenceName} · {wildCardNote}
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Record", `${edm.wins}-${edm.losses}-${edm.otLosses}`],
                  ["PTS", String(edm.points)],
                  ["P%", pointPct(edm)],
                  ["GP", String(edm.gamesPlayed)],
                ].map(([k, val]) => (
                  <div key={k} className="rounded-md bg-sunken px-1 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{k}</dt>
                    <dd className="numeral text-lg">
                      <span>{val}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </Module>

        {/* Streak */}
        <Module title="Form" meta={standings.ok ? standings.meta : undefined}>
          {!standings.ok ? (
            <DataError what="the streak" error={standings.error} />
          ) : !edm ? (
            <p className="text-fg-muted">No games yet.</p>
          ) : (
            <div>
              <p className="text-sm text-fg-muted">Current streak</p>
              <p className="numeral text-6xl leading-none">{streakLabel(edm) || "—"}</p>
              <p className="mt-3 text-sm">
                <span className="font-semibold">Last 10:</span> {edm.l10Wins}-{edm.l10Losses}-{edm.l10OtLosses} ·{" "}
                <span className="font-semibold">Home:</span> {edm.homeWins}-{edm.homeLosses}-{edm.homeOtLosses} ·{" "}
                <span className="font-semibold">Road:</span> {edm.roadWins}-{edm.roadLosses}-{edm.roadOtLosses}
              </p>
              {schedule.ok && <p className="mt-1 text-xs text-fg-muted">Regular season from the schedule: {formatRecord(regRecord)}</p>}
            </div>
          )}
        </Module>

        {/* Top scorers */}
        <Module
          title="Top scorers"
          meta={stats.ok ? stats.meta : undefined}
          className="md:col-span-2 lg:col-span-3"
          action={
            <Link href="/roster" className="text-sm font-semibold text-accent-ink underline">
              All players
            </Link>
          }
        >
          {!stats.ok ? (
            <DataError what="team stats" error={stats.error} />
          ) : stats.data.skaters.every((s) => s.gamesPlayed === 0) ? (
            <p className="text-fg-muted">No games played yet this season.</p>
          ) : (
            <ol className="grid gap-3 sm:grid-cols-3">
              {topScorers(stats.data.skaters).map((p, i) => (
                <li key={p.playerId}>
                  <Link
                    href={`/player/${p.playerId}`}
                    className="group flex h-full items-center gap-3 rounded-lg border border-line bg-surface p-3 transition hover:border-line-strong"
                  >
                    <span className="numeral text-3xl text-accent-ink">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg-muted">{txt(p.firstName)}</span>
                      <span className="display block truncate text-2xl leading-none group-hover:underline">{txt(p.lastName)}</span>
                      <span className="mt-1 block text-sm">
                        <span className="numeral">{p.points}</span> PTS · {p.goals} G · {p.assists} A
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Module>

      </div>

      <p className="mt-10 text-center text-xs text-fg-muted">
        Stats site build · step 1 of 5 · the stats home page arrives in step 3 ·{" "}
        <Link href="/data" className="underline">
          Data status
        </Link>{" "}
        ·{" "}
        <Link href="/styleguide" className="underline">
          Style guide
        </Link>
      </p>
    </div>
  );
}
