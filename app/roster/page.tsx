import type { Metadata } from "next";
import { connection } from "next/server";
import { DataError } from "@/components/data/Module";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { PlayerCard } from "@/components/ui/PlayerCard";
import { load } from "@/lib/load";
import { nhl, txt, type ClubGoalieStats, type ClubSkaterStats, type RosterPlayer } from "@/lib/nhl";
import { age, savePct } from "@/lib/oilers";

export const metadata: Metadata = { title: "Players" };

const POSITION: Record<string, string> = { C: "Centre", L: "Left wing", R: "Right wing", D: "Defence", G: "Goalie" };

const byNumber = (a: RosterPlayer, b: RosterPlayer) => (a.sweaterNumber ?? 999) - (b.sweaterNumber ?? 999);

export default async function RosterPage() {
  await connection();
  const [roster, stats] = await Promise.all([load(nhl.roster), load(nhl.clubStats)]);

  const skaterStats = new Map<number, ClubSkaterStats>(stats.ok ? stats.data.skaters.map((s) => [s.playerId, s]) : []);
  const goalieStats = new Map<number, ClubGoalieStats>(stats.ok ? stats.data.goalies.map((s) => [s.playerId, s]) : []);

  const detail = (p: RosterPlayer) => {
    const bio = [p.positionCode !== "G" && p.shootsCatches ? `Shoots ${p.shootsCatches}` : p.shootsCatches ? `Catches ${p.shootsCatches}` : "", p.birthDate ? `Age ${age(p.birthDate)}` : ""]
      .filter(Boolean)
      .join(" · ");
    const s = skaterStats.get(p.id);
    const g = goalieStats.get(p.id);
    const line = g
      ? `${g.gamesPlayed} GP · ${g.wins}-${g.losses}-${g.overtimeLosses} · ${savePct(g.savePercentage)} SV%`
      : s
        ? `${s.gamesPlayed} GP · ${s.goals} G · ${s.assists} A · ${s.points} PTS`
        : "";
    return (
      <>
        <span className="block">{bio}</span>
        {line && (
          <span className="numeral block text-fg">
            {line}
          </span>
        )}
      </>
    );
  };

  const groups: { title: string; players: RosterPlayer[] }[] = roster.ok
    ? [
        { title: "Forwards", players: [...roster.data.forwards].sort(byNumber) },
        { title: "Defence", players: [...roster.data.defensemen].sort(byNumber) },
        { title: "Goalies", players: [...roster.data.goalies].sort(byNumber) },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Current roster</p>
      <h1 className="display-hero mt-2 text-6xl sm:text-7xl">Players</h1>
      {roster.ok && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-4 text-fg-muted">
          {roster.data.forwards.length + roster.data.defensemen.length + roster.data.goalies.length} players
          <LastUpdated at={roster.meta.fetchedAt} stale={roster.meta.stale} />
        </p>
      )}

      {!roster.ok ? (
        <div className="mt-6">
          <DataError what="the roster" error={roster.error} />
        </div>
      ) : (
        <div className="mt-8 space-y-12">
          {groups.map((grp) => (
            <section key={grp.title} aria-labelledby={`g-${grp.title}`}>
              <div className="flex items-end gap-4">
                <h2 id={`g-${grp.title}`} className="display text-4xl">
                  {grp.title}
                </h2>
                <div className="sleeve-stripes-thin mb-2 flex-1 rounded-sm" aria-hidden />
              </div>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {grp.players.map((p) => (
                  <li key={p.id}>
                    <PlayerCard
                      name={`${txt(p.firstName)} ${txt(p.lastName)}`}
                      number={p.sweaterNumber ?? "–"}
                      position={POSITION[p.positionCode] ?? p.positionCode}
                      href={`/player/${p.id}`}
                      detail={detail(p)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!stats.ok && <DataError what="this season's stats" error={stats.error} />}
        </div>
      )}
    </div>
  );
}
