import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataError, Module } from "@/components/data/Module";
import { Spoiler } from "@/components/ui/Spoiler";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { load } from "@/lib/load";
import { nhl, txt } from "@/lib/nhl";
import { formatGameDate, formatGameTime } from "@/lib/oilers";

export const metadata: Metadata = { title: "Game" };

const STATE: Record<string, string> = { FUT: "Upcoming", PRE: "Pre-game", LIVE: "Live", CRIT: "Live", FINAL: "Final", OFF: "Final" };

/** Placeholder until the Game Day Hub (Phase 5): the matchup and score. */
export default async function GamePage({ params }: PageProps<"/game/[id]">) {
  const { id } = await params;
  if (!/^\d{10}$/.test(id)) notFound();
  const landing = await load(() => nhl.gameLanding(Number(id)));
  if (!landing.ok && landing.notFound) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Game Day Hub · coming in Phase 5</p>
      {!landing.ok ? (
        <>
          <h1 className="display-hero mt-2 text-5xl">Game {id}</h1>
          <div className="mt-6">
            <DataError what="this game" error={landing.error} />
          </div>
        </>
      ) : (
        <>
          <h1 className="display-hero mt-2 text-5xl sm:text-6xl">
            {landing.data.awayTeam.abbrev} @ {landing.data.homeTeam.abbrev}
          </h1>
          <Module title={STATE[landing.data.gameState] ?? landing.data.gameState} meta={landing.meta} className="mt-6">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
              {[landing.data.awayTeam, null, landing.data.homeTeam].map((t, i) =>
                t ? (
                  <div key={t.abbrev} className="flex flex-col items-center gap-2">
                    <TeamLogo abbrev={t.abbrev} logo={t.logo} darkLogo={t.darkLogo} size={64} />
                    <span className="display text-2xl">{txt(t.commonName, t.abbrev)}</span>
                  </div>
                ) : (
                  <div key={i}>
                    {landing.data.awayTeam.score !== undefined ? (
                      <Spoiler label="score" className="numeral text-6xl">
                        {landing.data.awayTeam.score}–{landing.data.homeTeam.score}
                      </Spoiler>
                    ) : (
                      <span className="display-hero text-4xl text-accent-ink">@</span>
                    )}
                  </div>
                ),
              )}
            </div>
            <p className="mt-4 text-center text-sm text-fg-muted">
              {formatGameDate(landing.data.startTimeUTC, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} ·{" "}
              {formatGameTime(landing.data.startTimeUTC)} MT · {txt(landing.data.venue)}
            </p>
          </Module>
          <p className="mt-6 text-fg-muted">
            The full hub (live play-by-play, shot map, box score, win probability and fan ratings) is built in Phase 5.
          </p>
        </>
      )}
      <Link href="/schedule" className="btn btn-secondary mt-8">
        Full schedule
      </Link>
    </div>
  );
}
