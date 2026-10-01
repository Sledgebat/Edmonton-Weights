import type { Metadata } from "next";
import { connection } from "next/server";
import { ReplayMonitor } from "@/components/game/ReplayMonitor";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { NhlError, nhl, txt, type Meta } from "@/lib/nhl";
import { isFinished } from "@/lib/nhl/endpoints";
import { dataStatus } from "@/lib/nhl/status";

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
  live: { name: "Live", blurb: "Fetching from the NHL through the SQLite cache." },
  fixtures: { name: "Fixtures", blurb: "Serving saved responses from fixtures/. No network." },
  replay: { name: "Replay", blurb: "Replaying a finished game as if it were live; everything else from fixtures." },
} as const;

const API_ROUTES = [
  "/api/standings",
  "/api/schedule",
  "/api/schedule?season=19831984",
  "/api/score",
  "/api/roster",
  "/api/club-stats",
  "/api/prospects",
  "/api/player/8478402",
  "/api/player/8478402?gameLog=20252026&gameType=2",
  "/api/game/2026020004",
  "/api/status",
  "/api/replay",
];

const fmtTime = (t: number) =>
  new Date(t).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" });

export default async function DataPage() {
  await connection();

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
  const mode = MODE_INFO[status.mode];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Data layer</p>
      <h1 className="display-hero mt-2 text-6xl sm:text-7xl">Data status</h1>
      <p className="mt-3 max-w-prose text-lg text-fg-muted">
        Only this server talks to the NHL. Pages and browsers read the site&apos;s own <code>/api/*</code> routes, which
        serve from a local cache.
      </p>

      <section className="mt-8 grid gap-4 md:grid-cols-[2fr_3fr]" aria-labelledby="mode">
        <div className="card p-5">
          <h2 id="mode" className="text-xs font-semibold uppercase tracking-widest text-fg-muted">
            Current mode
          </h2>
          <p className="display mt-1 text-4xl">{mode.name}</p>
          <p className="mt-1 text-fg-muted">{mode.blurb}</p>
        </div>
        <div className="card p-5 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Switch modes</h2>
          <p className="mt-2">Stop the server (Ctrl+C), then start it with one of:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-sunken p-3 text-xs leading-relaxed">
            {`npm run dev                          # live
NHL_MODE=fixtures npm run dev        # offline, saved data
NHL_MODE=replay npm run dev          # replay the last captured game
NHL_MODE=replay GAME_ID=2026020004 npm run dev`}
          </pre>
        </div>
      </section>

      {status.mode === "replay" && (
        <section className="mt-10" aria-labelledby="replay">
          <h2 id="replay" className="display text-4xl">
            Replay
          </h2>
          <p className="mt-1 text-fg-muted">
            A finished game played back at {status.replay?.speed ?? 10}x speed, updating below without a page reload. Game
            pages use the same feed.
          </p>
          <div className="mt-4 max-w-xl">
            {status.replayError ? (
              <p className="card p-4 text-loss">{status.replayError}</p>
            ) : (
              <ReplayMonitor initial={status.replay ?? null} />
            )}
          </div>
        </section>
      )}

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

      {status.mode === "live" && (
        <section className="mt-10" aria-labelledby="cache">
          <h2 id="cache" className="display text-4xl">
            Cache
          </h2>
          <p className="mt-1 text-fg-muted">Every NHL response the server has stored, and when it will refresh.</p>
          <div className="card mt-4 overflow-x-auto">
            <table className="tabular w-full text-left text-sm">
              <thead className="bg-header text-header-fg">
                <tr>
                  <th className="px-3 py-2">Feed</th>
                  <th className="px-3 py-2">Fetched</th>
                  <th className="px-3 py-2">Refreshes</th>
                  <th className="px-3 py-2">Health</th>
                </tr>
              </thead>
              <tbody>
                {status.cache.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-fg-muted">
                      Nothing cached yet.
                    </td>
                  </tr>
                )}
                {status.cache.map((c) => (
                  <tr key={c.path} className="border-t border-line align-top">
                    <td className="px-3 py-2">
                      {c.label}
                      <span className="block break-all font-mono text-[11px] text-fg-muted">{c.path}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{fmtTime(c.fetchedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{fmtTime(c.expiresAt)}</td>
                    <td className={`px-3 py-2 font-semibold ${c.failCount ? "text-loss" : "text-win"}`}>
                      {c.failCount ? `Stale (${c.failCount} failed): ${c.lastError}` : c.fresh ? "Fresh" : "Due"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="routes">
        <h2 id="routes" className="display text-4xl">
          API routes
        </h2>
        <p className="mt-1 text-fg-muted">What browsers call. Each returns JSON as {"{ data, meta }"}.</p>
        <ul className="mt-4 grid gap-1 font-mono text-sm sm:grid-cols-2">
          {API_ROUTES.map((r) => (
            <li key={r}>
              <a href={r} className="break-all text-accent-ink underline">
                {r}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
