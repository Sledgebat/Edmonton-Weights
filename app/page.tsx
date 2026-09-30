import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";

/**
 * Phase 1 placeholder home page: confirms the app runs and shows the
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

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">Prototype · Phase 1 of 8</p>
      <h1 className="mt-2 text-4xl font-extrabold italic tracking-tight sm:text-5xl">Oil Country Hub</h1>
      <p className="mt-3 max-w-2xl opacity-80">
        The project is set up. This page is a temporary status board; the real home dashboard arrives in Phase 4.
      </p>

      <ol className="mt-8 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="Build phases">
        {PHASES.map((name, i) => (
          <li
            key={name}
            className={`rounded-md border px-3 py-2 ${
              i === 0 ? "border-accent bg-brand text-white" : "border-current/15 opacity-60"
            }`}
          >
            <span className="block text-xs opacity-80">Phase {i + 1}</span>
            {name}
          </li>
        ))}
      </ol>

      <section className="mt-10" aria-labelledby="endpoints">
        <h2 id="endpoints" className="text-2xl font-bold">NHL endpoint check</h2>

        {!report ? (
          <div className="mt-4 rounded-lg border border-current/15 p-5">
            <p>No fixtures captured yet. In a terminal, from the project folder, run:</p>
            <pre className="mt-3 overflow-x-auto rounded bg-black/80 p-3 text-sm text-white">
              npm run fixtures:capture
            </pre>
            <p className="mt-3 text-sm opacity-80">Then refresh this page.</p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm opacity-80">
              {report.totals.ok} of {report.totals.requested} endpoints returned data · captured{" "}
              {new Date(report.capturedAt).toLocaleString("en-CA", { timeZone: "America/Edmonton" })}
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-current/15">
              <table className="w-full text-left text-sm [font-variant-numeric:tabular-nums]">
                <thead className="bg-brand text-white">
                  <tr>
                    <th className="hidden px-3 py-2 sm:table-cell">Group</th>
                    <th className="px-3 py-2">Endpoint</th>
                    <th className="px-3 py-2 text-right">Size</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((r) => (
                    <tr key={r.path} className="border-t border-current/10">
                      <td className="hidden px-3 py-2 opacity-70 sm:table-cell">{r.group}</td>
                      <td className="break-all px-3 py-2 font-mono text-xs">{r.path}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{(r.bytes / 1024).toFixed(1)} KB</td>
                      <td className={`whitespace-nowrap px-3 py-2 font-semibold ${r.ok ? "" : "text-red-600"}`}>
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

      <footer className="mt-16 border-t border-current/15 pt-4 text-xs opacity-70">
        Independent fan site. Not affiliated with the Edmonton Oilers, Oilers Entertainment Group or the NHL.
      </footer>
    </main>
  );
}
