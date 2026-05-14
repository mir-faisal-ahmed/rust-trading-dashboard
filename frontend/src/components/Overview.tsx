import type { BenchmarkRun, Strategy } from "../types";

interface OverviewProps {
  strategies: Strategy[];
  runs: BenchmarkRun[];
  onSelectRun: (run: BenchmarkRun) => void;
}

function StatBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
      <div className="text-neutral-500 uppercase text-[10px] tracking-wider">{label}</div>
      <div className={`text-lg font-bold font-mono ${color ?? "text-neutral-200"}`}>{value}</div>
    </div>
  );
}

export function Overview({ strategies, runs, onSelectRun }: OverviewProps) {
  const completed = runs.filter((r) => r.status === "completed");
  const runningCount = strategies.filter((s) => s.status === "running").length;
  const failedCount  = strategies.filter((s) => s.status === "failed").length;

  const sortedBySharpe = [...completed].sort(
    (a, b) => (b.metrics?.sharpe_ratio ?? 0) - (a.metrics?.sharpe_ratio ?? 0)
  );
  const sortedByReturn = [...completed].sort(
    (a, b) => (b.metrics?.total_return_pct ?? 0) - (a.metrics?.total_return_pct ?? 0)
  );

  const best  = sortedBySharpe[0] ?? null;
  const worst = sortedBySharpe[sortedBySharpe.length - 1] ?? null;

  function avg(fn: (r: BenchmarkRun) => number): string {
    if (completed.length === 0) return "N/A";
    return (completed.reduce((s, r) => s + fn(r), 0) / completed.length).toFixed(2);
  }

  const avgSharpe = avg((r) => r.metrics?.sharpe_ratio ?? 0);
  const avgReturn = avg((r) => r.metrics?.total_return_pct ?? 0);
  const avgMaxDD  = avg((r) => r.metrics?.max_drawdown_pct ?? 0);
  const avgVol    = avg((r) => r.metrics?.volatility_ann_pct ?? 0);
  const worstDD   = completed.length > 0
    ? Math.min(...completed.map((r) => r.metrics?.max_drawdown_pct ?? 0)).toFixed(2)
    : "N/A";

  const typeCounts: Record<string, number> = {};
  strategies.forEach((s) => { typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1; });

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* top stats */}
      <div className="grid grid-cols-6 gap-2">
        <StatBlock label="Total Strategies" value={String(strategies.length)} />
        <StatBlock label="Completed Runs"   value={String(completed.length)} />
        <StatBlock label="Running"          value={String(runningCount)} color={runningCount > 0 ? "text-blue-400" : undefined} />
        <StatBlock label="Failed"           value={String(failedCount)}  color={failedCount > 0  ? "text-red-400"  : undefined} />
        <StatBlock label="Avg Sharpe"       value={avgSharpe}  color={Number(avgSharpe) > 1  ? "text-green-400" : undefined} />
        <StatBlock label="Avg Return"       value={`${avgReturn}%`} color={Number(avgReturn) > 0 ? "text-green-400" : "text-red-400"} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {best && (
          <div className="border border-neutral-700 bg-neutral-950 px-3 py-2 cursor-pointer hover:border-green-800" onClick={() => onSelectRun(best)}>
            <div className="text-neutral-500 uppercase text-[10px] mb-1">Best Performer (Sharpe)</div>
            <div className="text-green-400 font-bold">{best.strategy_name}</div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-neutral-400">
              <div><span className="text-neutral-600">sharpe </span><span className="text-green-400">{best.metrics?.sharpe_ratio ?? "—"}</span></div>
              <div><span className="text-neutral-600">ret </span><span className="text-green-400">{best.metrics?.total_return_pct ?? "—"}%</span></div>
              <div><span className="text-neutral-600">dd </span><span className="text-red-400">{best.metrics?.max_drawdown_pct ?? "—"}%</span></div>
            </div>
          </div>
        )}

        {worst && worst.id !== best?.id && (
          <div className="border border-neutral-700 bg-neutral-950 px-3 py-2 cursor-pointer hover:border-red-800" onClick={() => onSelectRun(worst)}>
            <div className="text-neutral-500 uppercase text-[10px] mb-1">Worst Performer (Sharpe)</div>
            <div className="text-red-400 font-bold">{worst.strategy_name}</div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-neutral-400">
              <div><span className="text-neutral-600">sharpe </span><span className="text-red-400">{worst.metrics?.sharpe_ratio ?? "—"}</span></div>
              <div>
                <span className="text-neutral-600">ret </span>
                <span className={(worst.metrics?.total_return_pct ?? 0) > 0 ? "text-green-400" : "text-red-400"}>
                  {worst.metrics?.total_return_pct ?? "—"}%
                </span>
              </div>
              <div><span className="text-neutral-600">dd </span><span className="text-red-400">{worst.metrics?.max_drawdown_pct ?? "—"}%</span></div>
            </div>
          </div>
        )}

        <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
          <div className="text-neutral-500 uppercase text-[10px] mb-1">Portfolio Risk Summary</div>
          <div className="space-y-1 mt-2">
            <div className="flex justify-between"><span className="text-neutral-500">Avg Max DD</span><span className="text-red-400">{avgMaxDD}%</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Worst DD</span><span className="text-red-400">{worstDD}%</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Avg Vol</span><span className="text-neutral-300">{avgVol}%</span></div>
          </div>
        </div>
      </div>

      {/* type distribution */}
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-2">Strategy Distribution</div>
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <div key={type} className="flex justify-between border-b border-neutral-800 py-1">
              <span className="text-neutral-400">{type.replace("_", " ")}</span>
              <span className="text-neutral-200">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* leaderboard */}
      {completed.length > 0 ? (
        <div className="border border-neutral-700 bg-neutral-950">
          <div className="px-3 py-1.5 border-b border-neutral-700 text-amber-500 font-bold uppercase">
            Leaderboard — Total Return
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-700 text-neutral-500">
                <th className="px-2 py-1 text-left font-normal">#</th>
                <th className="px-2 py-1 text-left font-normal">STRATEGY</th>
                <th className="px-2 py-1 text-right font-normal">RETURN</th>
                <th className="px-2 py-1 text-right font-normal">SHARPE</th>
                <th className="px-2 py-1 text-right font-normal">MAX DD</th>
                <th className="px-2 py-1 text-right font-normal">WIN%</th>
                <th className="px-2 py-1 text-right font-normal">PF</th>
                <th className="px-2 py-1 text-right font-normal">TRADES</th>
              </tr>
            </thead>
            <tbody>
              {sortedByReturn.map((run, i) => {
                const m = run.metrics;
                return (
                  <tr key={run.id} onClick={() => onSelectRun(run)} className="border-b border-neutral-800 hover:bg-neutral-900 cursor-pointer">
                    <td className="px-2 py-1 text-neutral-500">{i + 1}</td>
                    <td className="px-2 py-1 text-neutral-200">{run.strategy_name}</td>
                    <td className={`px-2 py-1 text-right ${(m?.total_return_pct ?? 0) > 0 ? "text-green-400" : "text-red-400"}`}>
                      {m ? `${m.total_return_pct > 0 ? "+" : ""}${m.total_return_pct}%` : "—"}
                    </td>
                    <td className={`px-2 py-1 text-right ${(m?.sharpe_ratio ?? 0) > 1 ? "text-green-400" : "text-neutral-300"}`}>
                      {m?.sharpe_ratio ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-right text-red-400">{m ? `${m.max_drawdown_pct}%` : "—"}</td>
                    <td className="px-2 py-1 text-right text-neutral-300">{m ? `${m.win_rate_pct}%` : "—"}</td>
                    <td className="px-2 py-1 text-right text-neutral-300">{m?.profit_factor ?? "—"}</td>
                    <td className="px-2 py-1 text-right text-neutral-400">{m?.total_trades ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-neutral-700 bg-neutral-950 px-4 py-8 text-center text-neutral-600">
          no completed benchmark runs yet
        </div>
      )}
    </div>
  );
}
