import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ClutchBox, EdgeSection, HotAndCold, LastGame, Leaders, MilestoneStrip, NextGame, RecentPerformance, SectionHeading, Snapshot, StatTiles } from "@/components/home/Sections";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { homeData } from "@/lib/home";
import { seasonLabel } from "@/lib/nhl/endpoints";

/**
 * Home: how the Oilers are doing, and why, on one page.
 *   1 snapshot (personality tag, milestone watch) · 2 next game (what's at stake and the season series; pre-game breakdown folds
 *   open) · last game (comeback / stolen badges) · 3 recent performance · 4 team stats (luck gauge on PDO) · 5 leaders (Clutch
 *   Score, hot and cold) · 6 NHL EDGE. Links to the Oilers Season In-Depth page for the deep dive.
 */
export default async function Home() {
  const d = await homeData();
  const sched = d.schedule.ok ? d.schedule.meta : null;

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="sr-only">EdmontonWeights: Edmonton Oilers stats</h1>

      <section aria-labelledby="snapshot">
        <SectionHeading id="snapshot" title={`Oilers ${seasonLabel(d.currentSeason)}`} />
        {d.dash.personality && (
          <Link
            href="/team/EDM#personality"
            className="-mt-3 mb-3 inline-flex items-center gap-1 rounded-full border border-accent px-3 py-0.5 text-sm font-semibold text-accent-ink hover:underline"
            title="Team personality: how they play, from where they rank in the league"
          >
            {d.dash.personality.label} <ArrowRight size={14} aria-hidden />
          </Link>
        )}
        <Snapshot d={d} />
        <MilestoneStrip d={d} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Link href="/team/EDM" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
            Oilers Season In-Depth <ArrowRight size={16} aria-hidden />
          </Link>
          {d.standings.ok && <LastUpdated at={d.standings.meta.fetchedAt} stale={d.standings.meta.stale} />}
        </div>
      </section>

      <section aria-labelledby="next">
        <SectionHeading id="next" title="Next game" />
        <NextGame d={d} />
        {sched && <LastUpdated at={sched.fetchedAt} stale={sched.stale} className="mt-2 block text-right" />}
      </section>

      <section aria-labelledby="last">
        <SectionHeading id="last" title="Last game" />
        <LastGame d={d} />
      </section>

      <section aria-labelledby="recent">
        <SectionHeading id="recent" title="Recent performance" note="Last 10 games, oldest first" />
        <RecentPerformance d={d} />
      </section>

      <section aria-labelledby="tiles">
        <SectionHeading id="tiles" title="Team stats at a glance" note={`${seasonLabel(d.season)} · league rank · arrows compare the last 10 games with the season`} />
        {(d.seasonNote || d.ranksNote) && <p className="-mt-2 mb-3 text-sm text-fg-muted">{[d.seasonNote, d.ranksNote].filter(Boolean).join(" ")}</p>}
        <StatTiles d={d} luck={d.dash.luck} />
        {d.updated.stats && <LastUpdated at={d.updated.stats} className="mt-2 block text-right" />}
      </section>

      <section aria-labelledby="leaders">
        <SectionHeading id="leaders" title="Leaders" />
        <Leaders d={d} />
        <ClutchBox d={d} />
        <HotAndCold d={d} />
        {d.sources.clubStats.ok && <LastUpdated at={d.sources.clubStats.meta.fetchedAt} stale={d.sources.clubStats.meta.stale} className="mt-2 block text-right" />}
      </section>

      <section aria-labelledby="edge">
        <SectionHeading id="edge" title="NHL EDGE tracking" note="Puck and player tracking, this season · league rank · tap a tile marked “See every player” for the whole roster" />
        <EdgeSection d={d} />
        {d.edge.ok && <LastUpdated at={d.edge.meta.fetchedAt} stale={d.edge.meta.stale} className="mt-2 block text-right" />}
      </section>
    </div>
  );
}
