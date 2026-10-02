import { seasonLabel } from "@/lib/nhl/endpoints";
import { statsCounts } from "@/lib/stats/ingest";
import { METRICS, leagueTable, type MetricKey } from "@/lib/stats/team";
import { currentModel } from "@/lib/stats/xg";

const COLS: MetricKey[] = ["xgfPct", "cfPct", "hdcfPct", "pdo", "ppXgf60", "pkXga60"];
const SHORT: Partial<Record<MetricKey, string>> = {
  xgfPct: "xGF%",
  cfPct: "CF%",
  hdcfPct: "HDCF%",
  pdo: "PDO",
  ppXgf60: "PP xGF/60",
  pkXga60: "PK xGA/60",
};

const fmt = (k: MetricKey, v: number) => (METRICS[k].format === "rate" ? v.toFixed(2) : v.toFixed(1));

type Holdout = { testSeason: number; auc: number; logLoss: number; baselineLogLoss: number; goals: number; expectedGoals: number; shots: number };

/** The advanced-stats engine at a glance: stored games, the xG model, and the league table. */
export function StatsEngineStatus({ season }: { season: number }) {
  const counts = statsCounts();
  const model = currentModel();
  const holdout = model.metrics.holdout as Holdout | null | undefined;
  const table = leagueTable(season).sort((a, b) => a.ranks.xgfPct - b.ranks.xgfPct);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5 text-sm">
          <h3 className="display text-2xl">Games stored</h3>
          {counts.games.length === 0 ? (
            <p className="mt-2 text-fg-muted">
              None yet. Run <code>npm run update</code>; after that the scheduled updates add new games automatically.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {counts.games
                .sort((a, b) => a.season - b.season)
                .map((g) => (
                  <li key={g.season} className="flex justify-between">
                    <span>{seasonLabel(g.season)}</span>
                    <span className="numeral">{g.n.toLocaleString()} games</span>
                  </li>
                ))}
              <li className="flex justify-between border-t border-line pt-1 text-fg-muted">
                <span>Shot attempts</span>
                <span className="numeral">{counts.shots.toLocaleString()}</span>
              </li>
              <li className="flex justify-between text-fg-muted">
                <span>Games with shift charts (ratings, lines)</span>
                <span className="numeral">{counts.shiftGames.toLocaleString()}</span>
              </li>
            </ul>
          )}
        </div>
        <div className="card p-5 text-sm">
          <h3 className="display text-2xl">Expected-goals model</h3>
          {model.provisional ? (
            <p className="mt-2 text-fg-muted">
              <span className="font-semibold text-loss">Provisional.</span> Using hand-set starting values until the model is
              trained on real games (the backfill does this automatically).
            </p>
          ) : (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-fg-muted">Trained</dt>
              <dd>{model.trainedAt?.slice(0, 10)} on {(model.metrics.trainingShots as number)?.toLocaleString()} shots</dd>
              {holdout && (
                <>
                  <dt className="text-fg-muted">Tested on</dt>
                  <dd>{seasonLabel(holdout.testSeason)} ({holdout.shots.toLocaleString()} shots, not used in training)</dd>
                  <dt className="text-fg-muted">AUC</dt>
                  <dd>
                    <span className="numeral">{holdout.auc.toFixed(3)}</span> <span className="text-fg-muted">(public models: about 0.75–0.80)</span>
                  </dd>
                  <dt className="text-fg-muted">Log loss</dt>
                  <dd>
                    <span className="numeral">{holdout.logLoss.toFixed(4)}</span>{" "}
                    <span className="text-fg-muted">vs {holdout.baselineLogLoss.toFixed(4)} with no model ({((1 - holdout.logLoss / holdout.baselineLogLoss) * 100).toFixed(1)}% better)</span>
                  </dd>
                  <dt className="text-fg-muted">Goals vs xG</dt>
                  <dd>
                    {holdout.goals.toLocaleString()} vs {holdout.expectedGoals.toLocaleString()}
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="tabular w-full min-w-[36rem] text-sm">
          <caption className="px-3 pt-3 text-left text-xs text-fg-muted">
            {seasonLabel(season)} regular season, 5-on-5 unless noted · rank in brackets (1 = best) · sorted by xGF%
          </caption>
          <thead className="bg-sunken text-[11px] uppercase tracking-wider text-fg-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Team</th>
              <th className="px-2 py-2 text-right font-semibold">GP</th>
              {COLS.map((k) => (
                <th key={k} className="px-2 py-2 text-right font-semibold">
                  <abbr title={METRICS[k].label} className="no-underline">
                    {SHORT[k]}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 2} className="px-3 py-3 text-fg-muted">
                  No games stored for this season yet.
                </td>
              </tr>
            )}
            {table.map((t) => (
              <tr key={t.teamId} className={`border-t border-line ${t.abbrev === "EDM" ? "bg-sunken font-semibold" : ""}`}>
                <td className={`px-3 py-1.5 ${t.abbrev === "EDM" ? "shadow-[inset_4px_0_0_var(--brand-accent)]" : ""}`}>{t.abbrev}</td>
                <td className="px-2 py-1.5 text-right">{t.gp}</td>
                {COLS.map((k) => (
                  <td key={k} className="whitespace-nowrap px-2 py-1.5 text-right">
                    {fmt(k, t.metrics[k])} <span className="text-xs text-fg-muted">({t.ranks[k]})</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
