import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { connection } from "next/server";

/**
 * Temporary home page: confirms the app runs and shows the
 * endpoint report from `npm run fixtures:capture`. Phase 4 replaces it
 * with the real Home dashboard.
 */

type CaptureResult = {
  group: string;
  path: string;
  ok: boolean;
  status: number | null;
  bytes: number;
  error?: string;
};

type CaptureReport = {
  capturedAt: string;
  totals: { requested: number; ok: number; failed: number };
  picks: Record<string, unknown>;
  results: CaptureResult[];
};

async function loadReport(): Promise<CaptureReport | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "fixtures", "_report.json"), "utf8");
    return JSON.parse(raw) as CaptureReport;
  } catch {
    return null;
  }
}

const PHASES = [
  "Setup",
  "Design system and site shell",
  "Data layer",
  "Core pages",
  "Game Day Hub",
  "Models and trackers",
  "History, fan ratings and polish",
  "Blog",
];

export default async function Home() {
  await connection(); // read the report on every request, not at build time
  const report = await loadReport();

  const done = 2; // phases complete

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">
        Prototype · Phase {done} of {PHASES.length} complete
      </p>
      <h1 className="display-hero mt-2 text-6xl sm:text-7xl">Oil Country Hub</h1>
      <p className="mt-3 max-w-2xl text-lg text-fg-muted">
        The design system and site shell are in. Try the jersey swatches in the header, then see every colour, font and
        component in the{" "}
        <Link href="/styleguide" className="font-semibold text-accent-ink underline">
          style guide
        </Link>
        . This temporary status board becomes the real home dashboard in Phase 4.
      </p>

      <ol className="mt-8 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="Build phases">
        {PHASES.map((name, i) => {
          const state = i < done ? "done" : i === done ? "next" : "later";
          return (
            <li
              key={name}
              className={`rounded-md border px-3 py-2 ${
                state === "done"
                  ? "border-header bg-header text-header-fg"
                  : state === "next"
                    ? "border-line-strong border-dashed bg-raised"
                    : "border-line bg-raised text-fg-muted"
              }`}
            >
              <span className="numeral block text-xs tracking-wide">
                Phase {i + 1}
                {state === "done" ? " · done" : state === "next" ? " · next" : ""}
              </span>
              {name}
            </li>
          );
        })}
      </ol>

      <div className="sleeve-stripes mt-12 rounded-sm" aria-hidden />

      <section className="mt-10" aria-labelledby="endpoints">
        <h2 id="endpoints" className="display text-4xl">NHL endpoint check</h2>

        {!report ? (
          <div className="card mt-4 p-5">
            <p>No fixtures captured yet. In a terminal, from the project folder, run:</p>
            <pre className="mt-3 overflow-x-auto rounded bg-sunken p-3 text-sm">npm run fixtures:capture</pre>
            <p className="mt-3 text-sm text-fg-muted">Then refresh this page.</p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-fg-muted">
              {report.totals.ok} of {report.totals.requested} endpoints returned data · captured{" "}
              {new Date(report.capturedAt).toLocaleString("en-CA", { timeZone: "America/Edmonton" })}
            </p>
            <div className="card mt-4 overflow-x-auto">
              <table className="tabular w-full text-left text-sm">
                <thead className="bg-header text-header-fg">
                  <tr>
                    <th className="hidden px-3 py-2 sm:table-cell">Group</th>
                    <th className="px-3 py-2">Endpoint</th>
                    <th className="px-3 py-2 text-right">Size</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((r) => (
                    <tr key={r.path} className="border-t border-line">
                      <td className="hidden px-3 py-2 text-fg-muted sm:table-cell">{r.group}</td>
                      <td className="break-all px-3 py-2 font-mono text-xs">{r.path}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{(r.bytes / 1024).toFixed(1)} KB</td>
                      <td className={`whitespace-nowrap px-3 py-2 font-semibold ${r.ok ? "text-win" : "text-loss"}`}>
                        {r.ok ? "OK" : `Failed (${r.error})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
