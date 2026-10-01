import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Tv } from "lucide-react";
import { DataError } from "@/components/data/Module";
import { ResultBadge } from "@/components/data/ResultBadge";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Spoiler } from "@/components/ui/Spoiler";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { load } from "@/lib/load";
import { nhl, txt, type ScheduleGame } from "@/lib/nhl";
import { edmontonDate } from "@/lib/nhl/resources";
import { GAME_TYPE_LABEL, byMonth, formatGameDate, formatGameTime, formatRecord, nextGame, record, seasonShort, teamView } from "@/lib/oilers";

export const metadata: Metadata = { title: "Schedule" };

type Filter = "all" | "regular" | "preseason";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All games" },
  { key: "regular", label: "Regular season" },
  { key: "preseason", label: "Preseason" },
];

function GameRow({ game, isNext }: { game: ScheduleGame; isNext: boolean }) {
  const v = teamView(game);
  const today = edmontonDate(new Date(game.startTimeUTC)) === edmontonDate();
  const tv = (game.tvBroadcasts ?? []).filter((b) => b.countryCode === "CA" || b.market === "N").map((b) => b.network);

  return (
    <li>
      <Link
        href={`/game/${game.id}`}
        className={`grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 border-t border-line px-3 py-3 transition hover:bg-sunken sm:grid-cols-[4.5rem_1fr_auto] sm:px-4 ${
          isNext ? "bg-sunken" : ""
        } ${v.isHome ? "border-l-4 border-l-accent" : "border-l-4 border-l-transparent"}`}
      >
        <span className="text-center leading-tight">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            {formatGameDate(game.startTimeUTC, { weekday: "short" })}
          </span>
          <span className="numeral block text-2xl">{formatGameDate(game.startTimeUTC, { day: "numeric" })}</span>
        </span>

        <span className="flex min-w-0 items-center gap-3">
          <TeamLogo abbrev={v.opp.abbrev} logo={v.opp.logo} darkLogo={v.opp.darkLogo} size={36} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">
              <span className="text-fg-muted">{v.prefix}</span> <span className="hidden sm:inline">{txt(v.opp.placeName)} </span>
              {txt(v.opp.commonName, v.opp.abbrev)}
            </span>
            <span className="block truncate text-xs text-fg-muted">
              {v.isHome ? "Home" : "Away"} · {txt(game.venue)}
              {game.gameType !== 2 && ` · ${GAME_TYPE_LABEL[game.gameType]}`}
              {isNext && <span className="ml-2 font-semibold uppercase text-accent-ink">Next</span>}
              {today && !v.finished && <span className="ml-2 font-semibold uppercase text-accent-ink">Today</span>}
            </span>
          </span>
        </span>

        <span className="text-right">
          {v.finished && v.outcome ? (
            <Spoiler label="result" className="inline-flex items-center gap-2">
              <span className="numeral text-lg">
                {v.us.score}–{v.opp.score}
                {v.decidedIn !== "REG" && <span className="ml-1 text-xs text-fg-muted">{v.decidedIn}</span>}
              </span>
              <ResultBadge outcome={v.outcome} />
            </Spoiler>
          ) : v.live ? (
            <span className="numeral inline-flex items-center gap-1.5 text-sm uppercase text-loss">
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden /> Live
            </span>
          ) : (
            <span className="block leading-tight">
              <span className="numeral block text-lg">{formatGameTime(game.startTimeUTC)}</span>
              {tv.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                  <Tv size={12} aria-hidden /> {tv.join(", ")}
                </span>
              )}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  await connection();
  const sp = await searchParams;
  const filter: Filter = sp.show === "regular" || sp.show === "preseason" ? sp.show : "all";
  const schedule = await load(nhl.schedule);

  if (!schedule.ok) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="display-hero text-6xl">Schedule</h1>
        <div className="mt-6">
          <DataError what="the schedule" error={schedule.error} />
        </div>
      </div>
    );
  }

  const all = schedule.data.games;
  const games = all.filter((g) => (filter === "regular" ? g.gameType !== 1 : filter === "preseason" ? g.gameType === 1 : true));
  const months = byMonth(games);
  const next = nextGame(all);
  const reg = record(all, 2);
  const pre = record(all, 1);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">{seasonShort(schedule.data.currentSeason)} season</p>
      <h1 className="display-hero mt-2 text-6xl sm:text-7xl">Schedule</h1>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p>
          <span className="text-fg-muted">Regular season:</span>{" "}
          <Spoiler label="record" className="numeral text-lg">
            {formatRecord(reg)}
          </Spoiler>
        </p>
        {pre.w + pre.l + pre.otl > 0 && (
          <p>
            <span className="text-fg-muted">Preseason:</span>{" "}
            <Spoiler label="record" className="numeral text-lg">
              {formatRecord(pre)}
            </Spoiler>
          </p>
        )}
        <LastUpdated at={schedule.meta.fetchedAt} stale={schedule.meta.stale} />
      </div>

      <nav aria-label="Filter games" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/schedule" : `/schedule?show=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              filter === f.key ? "border-button bg-button text-button-fg" : "border-line-strong hover:bg-sunken"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <nav aria-label="Jump to month" className="mt-3 flex gap-2 overflow-x-auto pb-1 text-sm">
        {months.map((m) => (
          <a key={m.key} href={`#m-${m.key}`} className="whitespace-nowrap rounded-md bg-sunken px-2.5 py-1 font-semibold hover:underline">
            {m.label.split(" ")[0].slice(0, 3)}
          </a>
        ))}
      </nav>

      <p className="mt-4 flex items-center gap-2 text-xs text-fg-muted">
        <span className="inline-block h-4 w-1 bg-accent" aria-hidden /> Home games · times are Mountain Time
      </p>

      <div className="mt-4 space-y-8">
        {months.length === 0 && <p className="text-fg-muted">No games in this view.</p>}
        {months.map((m) => (
          <section key={m.key} id={`m-${m.key}`} aria-labelledby={`h-${m.key}`} className="scroll-mt-24">
            <h2 id={`h-${m.key}`} className="display text-3xl">
              {m.label}
            </h2>
            <ol className="card mt-2 overflow-hidden">
              {m.games.map((g) => (
                <GameRow key={g.id} game={g} isNext={g.id === next?.id} />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
