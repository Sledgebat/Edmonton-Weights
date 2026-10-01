"use client";

import Link from "next/link";

/** Friendly error page for anything a module-level fallback didn't catch. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Icing</p>
      <h1 className="display-hero mt-2 text-6xl">Something went wrong</h1>
      <p className="mt-4 text-lg text-fg-muted">
        This page hit an unexpected error. It&apos;s usually the NHL&apos;s data service being slow; try again in a moment.
      </p>
      {process.env.NODE_ENV !== "production" && <p className="mt-2 font-mono text-xs text-fg-muted">{error.message}</p>}
      <div className="mt-8 flex justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Home
        </Link>
      </div>
    </div>
  );
}
