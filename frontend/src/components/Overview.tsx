import type { BenchmarkRun } from "../types";
import type { Strategy } from "../types";

interface OverviewProps {
  strategies: Strategy[];
  runs: BenchmarkRun[];
  onSelectRun: (run: BenchmarkRun) => void;
}

function StatBlock({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
      <div className="text-neutral-500 uppercase" style={{ fontSize: "10px", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div className={`text-lg font-bold font-mono ${color || "text-neutral-200"}`}>{value}</div>
      {sub && <div className="text-neutral-500 font-mono text-xs">{sub}</div>}
    </div>
  );
}

export function Overview({ strategies, runs, onSelectRun }: OverviewProps) {
  const completedRuns = runs.filter((r) => r.status === "completed");
  const runningCount = strategies.filter((s) => s.status === "running").length;
  const failedCount = strategies.filter((s) => s.status === "failed").length;

  // find best and worst by sharpe
  const sortedBySharpe = [...completedRuns].sort(
    (a, b) => b.metrics.sharpe_ratio - a.metrics.sharpe_ratio
  );
  const best = sortedBySharpe[0];
  const worst = sortedBySharpe[sortedBySharpe.length - 1];

  // find best by total return
  const sortedByReturn = [...completedRuns].sort(
    (a, b) => b.metrics.total_return_pct - a.metrics.total_return_pct
  );

  // average metrics across all completed
  const avgSharpe =
    completedRuns.length > 0
      ? (completedRuns.reduce((s, r) => s + r.metrics.sharpe_ratio, 0) / completedRuns.length).toFixed(2)
      : "N/A";
  const avgReturn =
    completedRuns.length > 0
      ? (completedRuns.reduce((s, r) => s + r.metrics.total_return_pct, 0) / completedRuns.length).toFixed(2)
      : "N/A";
  const avgMaxDD =
    completedRuns.length > 0
      ? (completedRuns.reduce((s, r) => s + r.metrics.max_drawdown_pct, 0) / completedRuns.length).toFixed(2)
      : "N/A";

  // strategy type distribution
  const typeCounts: Record<string, number> = {};
  strategies.forEach((s) => {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  });

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* top stats row */}
      <div className="grid grid-cols-6 gap-2">
        <StatBlock label="Total Strategies" value={String(strategies.length)} />
        <StatBlock label="Completed Runs" value={String(completedRuns.length)} />
        <StatBlock label="Running" value={String(runningCount)} color={runningCount > 0 ? "text-blue-400" : undefined} />
        <StatBlock label="Failed" value={String(failedCount)} color={failedCount > 0 ? "text-red-400" : undefined} />
        <StatBlock label="Avg Sharpe" value={avgSharpe} color={Number(avgSharpe) > 1 ? "text-green-400" : undefined} />
        <StatBlock label="Avg Return" value={`${avgReturn}%`} color={Number(avgReturn) > 0 ? "text-green-400" : "text-red-400"} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* best performer */}
        {best && (
          <div
            className="border border-neutral-700 bg-neutral-950 px-3 py-2 cursor-pointer hover:border-green-800"
            onClick={() => onSelectRun(best)}
          >
            <div className="text-neutral-500 uppercase mb-1" style={{ fontSize: "10px" }}>
              Best Performer (Sharpe)
            </div>
            <div className="text-green-400 font-bold">{best.strategy_name}</div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-neutral-400">
              <div>
                <span className="text-neutral-600">sharpe </span>
                <span className="text-green-400">{best.metrics.sharpe_ratio}</span>
              </div>
              <div>
                <span className="text-neutral-600">ret </span>
                <span className="text-green-400">{best.metrics.total_return_pct}%</span>
              </div>
              <div>
                <span className="text-neutral-600">dd </span>
                <span className="text-red-400">{best.metrics.max_drawdown_pct}%</span>
              </div>
            </div>
          </div>
        )}

        {/* worst performer */}
        {worst && (
          <div
            className="border border-neutral-700 bg-neutral-950 px-3 py-2 cursor-pointer hover:border-red-800"
            onClick={() => onSelectRun(worst)}
          >
            <div className="text-neutral-500 uppercase mb-1" style={{ fontSize: "10px" }}>
              Worst Performer (Sharpe)
            </div>
            <div className="text-red-400 font-bold">{worst.strategy_name}</div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-neutral-400">
              <div>
                <span className="text-neutral-600">sharpe </span>
                <span className="text-red-400">{worst.metrics.sharpe_ratio}</span>
              </div>
              <div>
                <span className="text-neutral-600">ret </span>
                <span className={worst.metrics.total_return_pct > 0 ? "text-green-400" : "text-red-400"}>
                  {worst.metrics.total_return_pct}%
                </span>
              </div>
              <div>
                <span className="text-neutral-600">dd </span>
                <span className="text-red-400">{worst.metrics.max_drawdown_pct}%</span>
              </div>
            </div>
          </div>
        )}

        {/* aggregate risk */}
        <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
          <div className="text-neutral-500 uppercase mb-1" style={{ fontSize: "10px" }}>
            Portfolio Risk Summary
          </div>
          <div className="space-y-1 mt-2">
            <div className="flex justify-between">
              <span className="text-neutral-500">Avg Max DD</span>
              <span className="text-red-400">{avgMaxDD}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Worst DD</span>
              <span className="text-red-400">
                {completedRuns.length > 0
                  ? Math.min(...completedRuns.map((r) => r.metrics.max_drawdown_pct)).toFixed(2)
                  : "N/A"}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Avg Vol</span>
              <span className="text-neutral-300">
                {completedRuns.length > 0
                  ? (completedRuns.reduce((s, r) => s + r.metrics.volatility_ann_pct, 0) / completedRuns.length).toFixed(2)
                  : "N/A"}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* strategy type distribution */}
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-2">Strategy Distribution</div>
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div key={type} className="flex justify-between border-b border-neutral-800 py-1">
                <span className="text-neutral-400">{type.replace("_", " ")}</span>
                <span className="text-neutral-200">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* leaderboard */}
      <div className="border border-neutral-700 bg-neutral-950">
        <div className="px-3 py-1.5 border-b border-neutral-700 text-amber-500 font-bold uppercase">
          Leaderboard - Total Return
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
            {sortedByReturn.map((run, i) => (
              <tr
                key={run.id}
                onClick={() => onSelectRun(run)}
                className="border-b border-neutral-800 hover:bg-neutral-900 cursor-pointer"
              >
                <td className="px-2 py-1 text-neutral-500">{i + 1}</td>
                <td className="px-2 py-1 text-neutral-200">{run.strategy_name}</td>
                <td className={`px-2 py-1 text-right ${run.metrics.total_return_pct > 0 ? "text-green-400" : "text-red-400"}`}>
                  {run.metrics.total_return_pct > 0 ? "+" : ""}{run.metrics.total_return_pct}%
                </td>
                <td className={`px-2 py-1 text-right ${run.metrics.sharpe_ratio > 1 ? "text-green-400" : "text-neutral-300"}`}>
                  {run.metrics.sharpe_ratio}
                </td>
                <td className="px-2 py-1 text-right text-red-400">{run.metrics.max_drawdown_pct}%</td>
                <td className="px-2 py-1 text-right text-neutral-300">{run.metrics.win_rate_pct}%</td>
                <td className="px-2 py-1 text-right text-neutral-300">{run.metrics.profit_factor}</td>
                <td className="px-2 py-1 text-right text-neutral-400">{run.metrics.total_trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
