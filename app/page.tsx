import { connection } from "next/server";
import { EdgeSection, LastGame, Leaders, NextGame, RecentPerformance, SectionHeading, Snapshot, StatTiles } from "@/components/home/Sections";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { homeData } from "@/lib/home";
import { seasonLabel } from "@/lib/nhl/endpoints";

/**
 * Home: how the Oilers are doing, and why, on one page.
 *   1 snapshot · 2 next game (pre-game breakdown folds open) · last game · 3 team stats · 4 recent performance · 5 leaders · 6 NHL EDGE
 */
export default async function Home() {
  await connection();
  const d = await homeData();
  const sched = d.schedule.ok ? d.schedule.meta : null;

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="sr-only">EdmontonWeights: Edmonton Oilers stats</h1>

      <section aria-labelledby="snapshot">
        <SectionHeading id="snapshot" title={`Oilers ${seasonLabel(d.currentSeason)}`} />
        <Snapshot d={d} />
        {d.standings.ok && <LastUpdated at={d.standings.meta.fetchedAt} stale={d.standings.meta.stale} className="mt-2 block text-right" />}
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

      <section aria-labelledby="tiles">
        <SectionHeading id="tiles" title="Team stats at a glance" note={`${seasonLabel(d.season)} · league rank · arrows compare the last 10 games with the season`} />
        {d.seasonNote && <p className="-mt-2 mb-3 text-sm text-fg-muted">{d.seasonNote}</p>}
        <StatTiles d={d} />
        {d.updated.stats && <LastUpdated at={d.updated.stats} className="mt-2 block text-right" />}
      </section>

      <section aria-labelledby="recent">
        <SectionHeading id="recent" title="Recent performance" note="Last 10 games, oldest first" />
        <RecentPerformance d={d} />
      </section>

      <section aria-labelledby="leaders">
        <SectionHeading id="leaders" title="Leaders" />
        <Leaders d={d} />
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
