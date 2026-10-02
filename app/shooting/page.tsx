import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ShootingExplorer } from "@/components/shooting/ShootingExplorer";
import { seasonLabel } from "@/lib/nhl/endpoints";
import { MIN_CAREER_SHOTS, shootingData } from "@/lib/shooting";

export const metadata: Metadata = { title: "Shooting vs career" };

/** Every Oilers skater's shooting % this season against his NHL career, with a career chart per player. */
export default async function ShootingPage() {
  const d = await shootingData();
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={14} aria-hidden /> Home
      </Link>
      <div>
        <h1 className="display-hero text-5xl sm:text-6xl">Shooting vs career</h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Who&apos;s scoring more than usual on his shots this season, and who&apos;s due. &ldquo;vs career&rdquo; is goals above or below what his career
          shooting % would give on the same shots, so it weighs how much a player shoots, not just the percentage. Select a player to chart his career.{" "}
          <Link href="/stats-guide#shooting" className="underline">
            More
          </Link>
        </p>
        {d.note && <p className="mt-2 text-sm text-fg-muted">{d.note}</p>}
      </div>
      {d.shooters.length ? (
        <ShootingExplorer shooters={d.shooters} seasonName={seasonLabel(d.season)} />
      ) : (
        <p className="text-fg-muted">Shows up once the Oilers have played a game this season.</p>
      )}
      <p className="text-xs text-fg-muted">
        Career = NHL regular seasons before {seasonLabel(d.season)}, all teams. Players with fewer than {MIN_CAREER_SHOTS} career shots have no career rate
        yet. Shooting % swings a lot over short stretches and drifts back toward a player&apos;s norm over time, which is why a cold start often means
        &ldquo;due&rdquo;.
      </p>
    </div>
  );
}
