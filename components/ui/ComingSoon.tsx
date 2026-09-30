import Link from "next/link";
import { Rivets } from "./Rivets";

/** Placeholder for routes that exist in the nav but are built in a later phase. */
export function ComingSoon({ title, phase, children }: { title: string; phase: number; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Coming in Phase {phase}</p>
      <h1 className="display-hero mt-2 text-5xl sm:text-6xl">{title}</h1>
      <Rivets className="mt-3 text-accent-ink" />
      <div className="mt-6 max-w-prose text-lg text-fg-muted">{children}</div>
      <Link href="/" className="btn btn-secondary mt-8">
        Back home
      </Link>
    </div>
  );
}
