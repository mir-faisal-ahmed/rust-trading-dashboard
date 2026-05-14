import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { BenchmarkRun } from "../types";

interface ComparisonViewProps {
  runs: BenchmarkRun[];
}

const COLORS = [
  "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

const METRIC_LABELS: Record<string, string> = {
  total_return_pct:      "Total Return %",
  annualized_return_pct: "Ann. Return %",
  sharpe_ratio:          "Sharpe Ratio",
  sortino_ratio:         "Sortino Ratio",
  calmar_ratio:          "Calmar Ratio",
  max_drawdown_pct:      "Max Drawdown %",
  volatility_ann_pct:    "Volatility %",
  win_rate_pct:          "Win Rate %",
  profit_factor:         "Profit Factor",
  total_trades:          "Total Trades",
  expectancy:            "Expectancy",
  alpha_ann_pct:         "Alpha %",
  beta:                  "Beta",
  information_ratio:     "Info Ratio",
  omega_ratio:           "Omega Ratio",
};

const LOWER_IS_BETTER = new Set(["max_drawdown_pct", "volatility_ann_pct", "beta"]);
const COMPARISON_METRICS = Object.keys(METRIC_LABELS);

function cellColor(key: string, val: number, all: number[]): string {
  if (all.length <= 1) return "text-neutral-300";
  const higherBetter = !LOWER_IS_BETTER.has(key);
  const sorted = [...all].sort((a, b) => (higherBetter ? b - a : a - b));
  const rank = sorted.indexOf(val);
  if (rank === 0) return "text-green-400";
  if (rank === all.length - 1) return "text-red-400";
  return "text-neutral-300";
}

export function ComparisonView({ runs }: ComparisonViewProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(runs.slice(0, 4).map((r) => r.id))
  );

  const selectedRuns = runs.filter((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 8) next.add(id);
      return next;
    });
  }

  const normalizedData: Record<string, unknown>[] = [];
  if (selectedRuns.length > 0) {
    const maxLen = Math.max(...selectedRuns.map((r) => r.equity_curve.length));
    const step = Math.max(1, Math.floor(maxLen / 200));
    for (let i = 0; i < maxLen; i += step) {
      const point: Record<string, unknown> = {};
      let hasDate = false;
      for (const run of selectedRuns) {
        if (run.equity_curve.length === 0) continue;
        const idx = Math.min(i, run.equity_curve.length - 1);
        const ep = run.equity_curve[idx];
        if (!hasDate) { point.date = ep.timestamp; hasDate = true; }
        const start = run.equity_curve[0].equity;
        point[run.strategy_name] = Number((((ep.equity - start) / start) * 100).toFixed(2));
      }
      if (hasDate) normalizedData.push(point);
    }
  }

  if (runs.length === 0) {
    return (
      <div className="border border-neutral-700 bg-neutral-950 px-4 py-8 text-center font-mono text-neutral-600 text-xs">
        no benchmark runs to compare
      </div>
    );
  }

  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-2">Select Strategies (max 8)</div>
        <div className="flex flex-wrap gap-2">
          {runs.map((run, idx) => (
            <button
              key={run.id}
              onClick={() => toggle(run.id)}
              className={`px-2 py-1 border transition-colors ${
                selected.has(run.id)
                  ? "border-amber-500 text-amber-400 bg-amber-500/10"
                  : "border-neutral-600 text-neutral-400 hover:border-neutral-400"
              }`}
              style={selected.has(run.id) ? { borderLeftColor: COLORS[idx % COLORS.length], borderLeftWidth: 3 } : {}}
            >
              {run.strategy_name}
            </button>
          ))}
        </div>
      </div>

      {selectedRuns.length > 0 && normalizedData.length > 0 && (
        <div className="border border-neutral-700 bg-neutral-950">
          <div className="px-3 py-1.5 border-b border-neutral-700 text-amber-500 font-bold uppercase">
            Normalized Returns (%)
          </div>
          <div className="p-2" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={normalizedData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="date" tick={{ fill: "#525252", fontSize: 10 }} axisLine={{ stroke: "#404040" }} tickLine={{ stroke: "#404040" }} interval={Math.floor(normalizedData.length / 6)} />
                <YAxis tick={{ fill: "#525252", fontSize: 10 }} axisLine={{ stroke: "#404040" }} tickLine={{ stroke: "#404040" }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: "#171717", border: "1px solid #404040", borderRadius: 0, fontSize: 11, fontFamily: "monospace" }} formatter={(v: unknown) => [`${v}%`]} />
                <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }} iconType="plainline" />
                {selectedRuns.map((run) => (
                  <Line key={run.id} type="monotone" dataKey={run.strategy_name}
                    stroke={COLORS[runs.findIndex((r) => r.id === run.id) % COLORS.length]}
                    strokeWidth={1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {selectedRuns.length > 0 && (
        <div className="border border-neutral-700 bg-neutral-950 overflow-x-auto">
          <div className="px-3 py-1.5 border-b border-neutral-700 text-amber-500 font-bold uppercase">
            Metrics Comparison
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-700">
                <th className="px-2 py-1.5 text-left text-neutral-500 font-normal sticky left-0 bg-neutral-950">METRIC</th>
                {selectedRuns.map((run) => (
                  <th key={run.id} className="px-2 py-1.5 text-right font-normal"
                    style={{ color: COLORS[runs.findIndex((r) => r.id === run.id) % COLORS.length] }}>
                    {run.strategy_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_METRICS.map((key) => {
                const values = selectedRuns.map(
                  (r) => (r.metrics?.[key as keyof typeof r.metrics] as number) ?? 0
                );
                return (
                  <tr key={key} className="border-b border-neutral-800 hover:bg-neutral-900">
                    <td className="px-2 py-1 text-neutral-400 sticky left-0 bg-neutral-950">
                      {METRIC_LABELS[key]}
                    </td>
                    {selectedRuns.map((run) => {
                      const val = (run.metrics?.[key as keyof typeof run.metrics] as number) ?? 0;
                      return (
                        <td key={run.id} className={`px-2 py-1 text-right ${run.metrics ? cellColor(key, val, values) : "text-neutral-600"}`}>
                          {run.metrics ? val : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
