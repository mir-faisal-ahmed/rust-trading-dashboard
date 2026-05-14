import { useState, useCallback, useEffect } from "react";
import type { ViewMode, BenchmarkRun } from "./types";
import { useAppData } from "./hooks/useAppData";
import { Sidebar } from "./components/Sidebar";
import { Overview } from "./components/Overview";
import { StrategyTable } from "./components/StrategyTable";
import { MetricsPanel } from "./components/MetricsPanel";
import { EquityCurve } from "./components/EquityCurve";
import { TradeLog } from "./components/TradeLog";
import { ComparisonView } from "./components/ComparisonView";
import { ConfigView } from "./components/ConfigView";

export default function App() {
  const [view, setView] = useState<ViewMode>("overview");
  const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);
  const { strategies, runs, loading, error } = useAppData();

  const runningCount = strategies.filter((s) => s.status === "running").length;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const keyMap: Record<string, ViewMode> = {
        F1: "overview",
        F2: "benchmarks",
        F3: "comparison",
        F4: "trades",
        F5: "config",
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        setView(keyMap[e.key]);
      }
      if (e.key === "Escape") setSelectedRun(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleSelectRun = useCallback((run: BenchmarkRun) => {
    setSelectedRun(run);
    setView("benchmarks");
  }, []);

  const allTrades = runs.flatMap((r) => r.trades);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 font-mono text-neutral-400 text-sm">
        connecting to backend...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 font-mono text-red-400 text-sm">
        <div className="text-center space-y-2">
          <div className="text-red-500 uppercase font-bold">connection error</div>
          <div>{error}</div>
          <div className="text-neutral-500 text-xs">is the backend running on port 8080?</div>
        </div>
      </div>
    );
  }

  function renderContent() {
    switch (view) {
      case "overview":
        return (
          <Overview
            strategies={strategies}
            runs={runs}
            onSelectRun={handleSelectRun}
          />
        );

      case "benchmarks":
        return (
          <div className="space-y-3">
            <StrategyTable
              runs={runs}
              onSelect={setSelectedRun}
              selectedId={selectedRun?.id ?? null}
            />
            {selectedRun ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {selectedRun.metrics ? (
                    <MetricsPanel
                      metrics={selectedRun.metrics}
                      title={`Metrics - ${selectedRun.strategy_name}`}
                    />
                  ) : (
                    <div className="border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-500 flex items-center justify-center">
                      metrics not available — run not completed
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs">
                      <div className="text-amber-500 font-bold uppercase mb-2">Run Details</div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-neutral-400">
                          <span className="text-neutral-500">Run ID</span>
                          <span>{selectedRun.id}</span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span className="text-neutral-500">Strategy ID</span>
                          <span>{selectedRun.strategy_id}</span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span className="text-neutral-500">Period</span>
                          <span>{selectedRun.start_date} to {selectedRun.end_date}</span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span className="text-neutral-500">Duration</span>
                          <span>{selectedRun.duration_ms}ms</span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span className="text-neutral-500">Status</span>
                          <span className={
                            selectedRun.status === "completed" ? "text-green-400" :
                            selectedRun.status === "running" ? "text-blue-400" :
                            "text-neutral-400"
                          }>
                            {selectedRun.status}
                          </span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span className="text-neutral-500">Started</span>
                          <span>{selectedRun.started_at.replace("T", " ").slice(0, 19)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs">
                      <div className="text-amber-500 font-bold uppercase mb-2">Quick Stats</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Equity Start</span>
                          <span className="text-neutral-300">
                            ${selectedRun.equity_curve.length > 0
                              ? selectedRun.equity_curve[0].equity.toLocaleString()
                              : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Equity End</span>
                          <span className={(selectedRun.metrics?.total_return_pct ?? 0) > 0 ? "text-green-400" : "text-red-400"}>
                            ${selectedRun.equity_curve.length > 0
                              ? selectedRun.equity_curve[selectedRun.equity_curve.length - 1].equity.toLocaleString()
                              : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Best Trade</span>
                          <span className="text-green-400">
                            {selectedRun.trades.length > 0
                              ? `+${Math.max(...selectedRun.trades.map((t) => t.pnl_pct)).toFixed(2)}%`
                              : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Worst Trade</span>
                          <span className="text-red-400">
                            {selectedRun.trades.length > 0
                              ? `${Math.min(...selectedRun.trades.map((t) => t.pnl_pct)).toFixed(2)}%`
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <EquityCurve
                  equity={selectedRun.equity_curve}
                  drawdown={selectedRun.drawdown_curve}
                  strategyName={selectedRun.strategy_name}
                />
                <TradeLog trades={selectedRun.trades} strategyFilter={selectedRun.strategy_id} />
              </>
            ) : (
              <div className="border border-neutral-700 bg-neutral-950 px-4 py-8 text-center font-mono text-neutral-500 text-sm">
                Select a strategy from the table above to view detailed metrics, equity curves, and trade logs.
              </div>
            )}
          </div>
        );

      case "comparison":
        return <ComparisonView runs={runs} />;

      case "trades":
        return <TradeLog trades={allTrades} />;

      case "config":
        return <ConfigView strategies={strategies} />;

      default:
        return null;
    }
  }

  return (
    <div className="flex min-h-screen bg-neutral-900 text-neutral-200">
      <Sidebar
        currentView={view}
        onViewChange={setView}
        strategyCount={strategies.length}
        runningCount={runningCount}
      />
      <div className="flex-1 flex flex-col">
        <div className="h-8 border-b border-neutral-700 bg-neutral-950 flex items-center justify-between px-3 font-mono text-xs">
          <div className="flex items-center gap-4">
            <span className="text-neutral-400 uppercase tracking-wider">{view}</span>
            {selectedRun && view === "benchmarks" && (
              <>
                <span className="text-neutral-600">/</span>
                <span className="text-amber-400">{selectedRun.strategy_name}</span>
                <button
                  onClick={() => setSelectedRun(null)}
                  className="text-neutral-500 hover:text-neutral-200 ml-2"
                >
                  [clear]
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-4 text-neutral-500">
            <span>{new Date().toISOString().slice(0, 19).replace("T", " ")} UTC</span>
            <span className="text-green-400">CONNECTED</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3">{renderContent()}</div>
      </div>
    </div>
  );
}
