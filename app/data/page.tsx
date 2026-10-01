import type { Metadata } from "next";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { NhlError, nhl, txt, type Meta } from "@/lib/nhl";
import { isFinished } from "@/lib/nhl/endpoints";
import { dataStatus } from "@/lib/nhl/status";
import { StatsEngineStatus } from "@/components/data/StatsEngineStatus";

export const metadata: Metadata = { title: "Data status" };

type Feed = { label: string; meta?: Meta; summary?: string; error?: string };

async function feed<T>(label: string, load: () => Promise<{ data: T; meta: Meta }>, summarize: (d: T) => string): Promise<Feed> {
  try {
    const { data, meta } = await load();
    return { label, meta, summary: summarize(data) };
  } catch (err) {
    return { label, error: err instanceof NhlError || err instanceof Error ? err.message : String(err) };
  }
}

const MODE_INFO = {
  live: { name: "NHL", blurb: "Downloaded from the NHL's public data during the update." },
  fixtures: { name: "Fixtures", blurb: "Serving saved responses from fixtures/. No network." },
  replay: { name: "Replay", blurb: "Replaying a finished game as if it were live; everything else from fixtures." },
} as const;

const fmtTime = (t: number) =>
  new Date(t).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" });

/** When this page was built (the site is pre-built, so this is the last update). */
const buildTime = () => Date.now();

export default async function DataPage() {
  // Load the core feeds (this also warms the cache in live mode).
  const feeds = await Promise.all([
    feed("Standings", nhl.standings, (d) => {
      const edm = d.standings.find((r) => txt(r.teamAbbrev) === "EDM");
      return `${d.standings.length} teams${edm ? ` · Oilers ${edm.wins}-${edm.losses}-${edm.otLosses}, ${edm.points} pts` : ""}`;
    }),
    feed("Schedule", nhl.schedule, (d) => {
      const next = d.games.find((g) => !isFinished(g.gameState));
      const opp = next ? (next.homeTeam.abbrev === "EDM" ? `vs ${next.awayTeam.abbrev}` : `@ ${next.homeTeam.abbrev}`) : "";
      return `${d.games.length} games${next ? ` · next ${opp}, ${fmtTime(Date.parse(next.startTimeUTC))}` : ""}`;
    }),
    feed("Scoreboard", nhl.score, (d) => `${d.games.length} games on ${d.currentDate}`),
    feed("Roster", nhl.roster, (d) => `${d.forwards.length} F · ${d.defensemen.length} D · ${d.goalies.length} G`),
    feed("Team stats", nhl.clubStats, (d) => {
      const top = [...d.skaters].sort((a, b) => b.points - a.points)[0];
      return top ? `Points leader: ${txt(top.firstName)} ${txt(top.lastName)} (${top.points})` : "No stats yet";
    }),
  ]);

  const status = await dataStatus();
  const scheduleFeed = await feed("Season", nhl.schedule, (d) => String(d.currentSeason));
  const season = Number(scheduleFeed.summary ?? 20262027);
  const mode = MODE_INFO[status.mode];
  const builtAt = buildTime();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Data layer</p>
      <h1 className="display-hero mt-2 text-6xl sm:text-7xl">Data status</h1>
      <p className="mt-3 max-w-prose text-lg text-fg-muted">
        The site is rebuilt from the NHL&apos;s public data three times a day: late evening after most games, overnight
        after West Coast games, and in the morning. Each update adds the newest games, recalculates every stat and
        republishes every page.
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="This build">
        <div className="card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Last update</h2>
          <p className="display mt-1 text-3xl">{fmtTime(builtAt)}</p>
          <p className="mt-1 text-sm text-fg-muted">Mountain Time</p>
        </div>
        <div className="card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Data source</h2>
          <p className="display mt-1 text-3xl">{mode.name}</p>
          <p className="mt-1 text-sm text-fg-muted">{mode.blurb}</p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="engine">
        <h2 id="engine" className="display text-4xl">
          Advanced stats engine
        </h2>
        <p className="mt-1 text-fg-muted">Shot attempts from every NHL game, our expected-goals model, and the league table it produces.</p>
        <div className="mt-4">
          <StatsEngineStatus season={season} />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="feeds">
        <h2 id="feeds" className="display text-4xl">
          Core feeds
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {feeds.map((f) => (
            <li key={f.label} className="card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="display text-2xl">{f.label}</h3>
                {f.meta && (
                  <span className="numeral rounded bg-sunken px-2 py-0.5 text-[11px] uppercase tracking-widest text-fg-muted">
                    {f.meta.source}
                  </span>
                )}
              </div>
              {f.error ? (
                <p className="mt-1 text-sm text-loss">{f.error}</p>
              ) : (
                <>
                  <p className="mt-1 text-sm">{f.summary}</p>
                  <LastUpdated at={f.meta!.fetchedAt} stale={f.meta!.stale} className="mt-2 block" />
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}
