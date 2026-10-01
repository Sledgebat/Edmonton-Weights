import { AlertTriangle } from "lucide-react";
import { LastUpdated } from "@/components/ui/LastUpdated";
import type { Meta } from "@/lib/nhl";

/** A titled data card with its "last updated" stamp. Every data module on the site uses it. */
export function Module({
  title,
  meta,
  action,
  className = "",
  children,
}: {
  title: string;
  meta?: Meta | Meta[];
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const metas = Array.isArray(meta) ? meta : meta ? [meta] : [];
  // The stamp shows the oldest input; stale if any input is stale.
  const oldest = metas.length ? metas.reduce((a, b) => (a.fetchedAt <= b.fetchedAt ? a : b)) : undefined;
  const stale = metas.some((m) => m.stale);
  return (
    <section className={`card flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-2xl leading-none">{title}</h2>
        {action}
      </div>
      <div className="mt-3 flex-1">{children}</div>
      {oldest && <LastUpdated at={oldest.fetchedAt} stale={stale} className="mt-3 block" />}
    </section>
  );
}

/** Friendly error state for a module whose data couldn't be loaded. */
export function DataError({ what, error }: { what: string; error?: string }) {
  const missingFixture = error?.includes("fixtures:capture");
  return (
    <div role="status" className="flex items-start gap-2 rounded-md bg-sunken p-3 text-sm">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-loss" aria-hidden />
      <div>
        <p className="font-semibold">Couldn&apos;t load {what} right now.</p>
        <p className="text-fg-muted">
          {missingFixture ? (
            <>
              This data hasn&apos;t been saved for offline mode yet. Run <code>npm run fixtures:capture</code>, or start the
              site in live mode.
            </>
          ) : (
            <>The NHL&apos;s data service may be busy. It&apos;ll retry automatically; refresh in a minute.</>
          )}
        </p>
        {error && process.env.NODE_ENV !== "production" && <p className="mt-1 font-mono text-xs text-fg-muted">{error}</p>}
      </div>
    </div>
  );
}
