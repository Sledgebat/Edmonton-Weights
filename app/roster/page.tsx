import type { Metadata } from "next";
import Link from "next/link";
import { RosterCards } from "@/components/players/RosterCards";

export const metadata: Metadata = { title: "Roster" };

/** The roster cards on their own page (also the Players page's Roster tab), kept so old links work. */
export default function RosterPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Current roster</p>
      <h1 className="display-hero mt-2 text-6xl sm:text-7xl">Players</h1>
      <p className="mb-8 mt-2 text-fg-muted">
        <Link href="/players" className="underline">
          Stats and lines
        </Link>{" "}
        are on the Players page.
      </p>
      <RosterCards />
    </div>
  );
}
