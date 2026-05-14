import { useState } from "react";
import type { BenchmarkRun, SortConfig } from "../types";

interface StrategyTableProps {
  runs: BenchmarkRun[];
  onSelect: (run: BenchmarkRun) => void;
  selectedId: string | null;
}

const columns = [
  { key: "strategy_name", label: "STRATEGY", width: "w-44" },
  { key: "status", label: "STATUS", width: "w-20" },
  { key: "metrics.total_return_pct", label: "TOTAL RET%", width: "w-24" },
  { key: "metrics.annualized_return_pct", label: "ANN RET%", width: "w-22" },
  { key: "metrics.sharpe_ratio", label: "SHARPE", width: "w-18" },
  { key: "metrics.sortino_ratio", label: "SORTINO", width: "w-18" },
  { key: "metrics.max_drawdown_pct", label: "MAX DD%", width: "w-20" },
  { key: "metrics.win_rate_pct", label: "WIN%", width: "w-16" },
  { key: "metrics.profit_factor", label: "PF", width: "w-14" },
  { key: "metrics.total_trades", label: "TRADES", width: "w-18" },
  { key: "metrics.volatility_ann_pct", label: "VOL%", width: "w-16" },
  { key: "duration_ms", label: "TIME(ms)", width: "w-20" },
];

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function pnlColor(val: number): string {
  if (val > 0) return "text-green-400";
  if (val < 0) return "text-red-400";
  return "text-neutral-400";
}

function statusIndicator(status: string): string {
  switch (status) {
    case "completed": return "text-green-400";
    case "running": return "text-blue-400";
    case "failed": return "text-red-400";
    case "queued": return "text-yellow-500";
    default: return "text-neutral-500";
  }
}

export function StrategyTable({ runs, onSelect, selectedId }: StrategyTableProps) {
  const [sort, setSort] = useState<SortConfig>({ key: "metrics.sharpe_ratio", direction: "desc" });

  const sorted = [...runs].sort((a, b) => {
    const aVal = getNestedValue(a as unknown as Record<string, unknown>, sort.key);
    const bVal = getNestedValue(b as unknown as Record<string, unknown>, sort.key);
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
    }
    const aStr = String(aVal || "");
    const bStr = String(bVal || "");
    return sort.direction === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });

  function handleSort(key: string) {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }

  return (
    <div className="border border-neutral-700 bg-neutral-950 font-mono text-xs overflow-x-auto">
      <div className="px-3 py-1.5 border-b border-neutral-700 text-amber-500 font-bold uppercase flex justify-between items-center">
        <span>Benchmark Results</span>
        <span className="text-neutral-500 font-normal">{runs.length} runs</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-700">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`px-2 py-1.5 text-left text-neutral-500 font-normal cursor-pointer hover:text-neutral-200 select-none ${
                  sort.key === col.key ? "text-amber-500" : ""
                }`}
              >
                {col.label}
                {sort.key === col.key && (
                  <span className="ml-1">{sort.direction === "asc" ? "^" : "v"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((run) => (
            <tr
              key={run.id}
              onClick={() => onSelect(run)}
              className={`border-b border-neutral-800 cursor-pointer transition-colors ${
                selectedId === run.id
                  ? "bg-neutral-800"
                  : "hover:bg-neutral-900"
              }`}
            >
              <td className="px-2 py-1.5 text-neutral-200 font-medium">{run.strategy_name}</td>
              <td className={`px-2 py-1.5 ${statusIndicator(run.status)}`}>{run.status}</td>
              <td className={`px-2 py-1.5 ${pnlColor(run.metrics.total_return_pct)}`}>
                {run.metrics.total_return_pct > 0 ? "+" : ""}{run.metrics.total_return_pct}
              </td>
              <td className={`px-2 py-1.5 ${pnlColor(run.metrics.annualized_return_pct)}`}>
                {run.metrics.annualized_return_pct > 0 ? "+" : ""}{run.metrics.annualized_return_pct}
              </td>
              <td className={`px-2 py-1.5 ${run.metrics.sharpe_ratio > 1 ? "text-green-400" : run.metrics.sharpe_ratio < 0 ? "text-red-400" : "text-neutral-300"}`}>
                {run.metrics.sharpe_ratio}
              </td>
              <td className="px-2 py-1.5 text-neutral-300">{run.metrics.sortino_ratio}</td>
              <td className="px-2 py-1.5 text-red-400">{run.metrics.max_drawdown_pct}</td>
              <td className={`px-2 py-1.5 ${run.metrics.win_rate_pct > 50 ? "text-green-400" : "text-neutral-300"}`}>
                {run.metrics.win_rate_pct}
              </td>
              <td className="px-2 py-1.5 text-neutral-300">{run.metrics.profit_factor}</td>
              <td className="px-2 py-1.5 text-neutral-400">{run.metrics.total_trades}</td>
              <td className="px-2 py-1.5 text-neutral-400">{run.metrics.volatility_ann_pct}</td>
              <td className="px-2 py-1.5 text-neutral-500">{run.duration_ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
