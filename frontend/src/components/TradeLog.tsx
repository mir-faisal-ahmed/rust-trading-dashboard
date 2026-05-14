import { useState } from "react";
import type { Trade, SortConfig } from "../types";

interface TradeLogProps {
  trades: Trade[];
  strategyFilter?: string;
}

function pnlColor(val: number): string {
  if (val > 0) return "text-green-400";
  if (val < 0) return "text-red-400";
  return "text-neutral-400";
}

export function TradeLog({ trades, strategyFilter }: TradeLogProps) {
  const [sort, setSort] = useState<SortConfig>({ key: "entry_time", direction: "desc" });
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const filtered = strategyFilter
    ? trades.filter((t) => t.strategy_id === strategyFilter)
    : trades;

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sort.key as keyof Trade];
    const bVal = b[sort.key as keyof Trade];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
    }
    return sort.direction === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key: string) {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }

  // aggregate stats
  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);
  const totalFees = filtered.reduce((s, t) => s + t.fees, 0);
  const wins = filtered.filter((t) => t.pnl > 0).length;
  const losses = filtered.filter((t) => t.pnl < 0).length;

  return (
    <div className="border border-neutral-700 bg-neutral-950 font-mono text-xs">
      <div className="px-3 py-1.5 border-b border-neutral-700 flex justify-between items-center">
        <span className="text-amber-500 font-bold uppercase">Trade Log</span>
        <div className="flex gap-4 text-neutral-400">
          <span>total: {filtered.length}</span>
          <span className="text-green-400">W:{wins}</span>
          <span className="text-red-400">L:{losses}</span>
          <span className={pnlColor(totalPnl)}>
            PnL: ${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span className="text-neutral-500">
            Fees: ${totalFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-700">
              {[
                { key: "symbol", label: "SYMBOL" },
                { key: "side", label: "SIDE" },
                { key: "entry_price", label: "ENTRY" },
                { key: "exit_price", label: "EXIT" },
                { key: "quantity", label: "QTY" },
                { key: "pnl", label: "PnL" },
                { key: "pnl_pct", label: "PnL%" },
                { key: "fees", label: "FEES" },
                { key: "slippage", label: "SLIP" },
                { key: "entry_time", label: "ENTRY TIME" },
                { key: "exit_time", label: "EXIT TIME" },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-2 py-1.5 text-left font-normal cursor-pointer hover:text-neutral-200 select-none ${
                    sort.key === col.key ? "text-amber-500" : "text-neutral-500"
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
            {paged.map((trade) => (
              <tr key={trade.id} className="border-b border-neutral-800 hover:bg-neutral-900">
                <td className="px-2 py-1 text-neutral-200">{trade.symbol}</td>
                <td className={`px-2 py-1 ${trade.side === "long" ? "text-green-400" : "text-red-400"}`}>
                  {trade.side.toUpperCase()}
                </td>
                <td className="px-2 py-1 text-neutral-300">{trade.entry_price.toFixed(2)}</td>
                <td className="px-2 py-1 text-neutral-300">{trade.exit_price.toFixed(2)}</td>
                <td className="px-2 py-1 text-neutral-400">{trade.quantity}</td>
                <td className={`px-2 py-1 ${pnlColor(trade.pnl)}`}>
                  {trade.pnl > 0 ? "+" : ""}{trade.pnl.toFixed(2)}
                </td>
                <td className={`px-2 py-1 ${pnlColor(trade.pnl_pct)}`}>
                  {trade.pnl_pct > 0 ? "+" : ""}{trade.pnl_pct.toFixed(2)}%
                </td>
                <td className="px-2 py-1 text-neutral-500">{trade.fees.toFixed(2)}</td>
                <td className="px-2 py-1 text-neutral-500">{trade.slippage.toFixed(2)}</td>
                <td className="px-2 py-1 text-neutral-500">{trade.entry_time.slice(0, 16).replace("T", " ")}</td>
                <td className="px-2 py-1 text-neutral-500">{trade.exit_time.slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-3 py-1.5 border-t border-neutral-700 flex justify-between items-center text-neutral-500">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2 py-0.5 border border-neutral-600 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              prev
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-0.5 border border-neutral-600 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
