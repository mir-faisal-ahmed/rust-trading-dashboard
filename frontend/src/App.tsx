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
import { LiveView } from "./components/LiveView";
import { TrainingView } from "./components/TrainingView";

export default function App() {
  const [view, setView] = useState<ViewMode>("overview");
  const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [runForm, setRunForm] = useState({
    strategyId: "",
    startDate: "2023-01-01",
    endDate: "2024-12-31",
    initialCapital: 100000,
  });
  const [runError, setRunError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { strategies, runs, loading, refreshing, error, runBenchmark } =
    useAppData();

  const runningCount = strategies.filter((s) => s.status === "running").length;
  const activeRuns = runs.filter(
    (r) => r.status === "queued" || r.status === "running"
  ).length;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const keyMap: Record<string, ViewMode> = {
        F1: "overview",
        F2: "benchmarks",
        F3: "comparison",
        F4: "trades",
        F5: "training",
        F6: "config",
        F7: "live",
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        setView(keyMap[e.key]);
      }
      if (e.key === "Escape") {
        setSelectedRun(null);
        setShowRunPanel(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleSelectRun = useCallback((run: BenchmarkRun) => {
    setSelectedRun(run);
    setView("benchmarks");
  }, []);

  const handleOpenRunPanel = () => {
    const defaultStrategy = strategies.find((s) => s.status === "idle");
    if (defaultStrategy) {
      setRunForm((f) => ({ ...f, strategyId: defaultStrategy.id }));
    }
    setRunError(null);
    setShowRunPanel(true);
  };

  const handleSubmitRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runForm.strategyId) {
      setRunError("Select a strategy");
      return;
    }
    setSubmitting(true);
    setRunError(null);
    try {
      await runBenchmark(runForm);
      setShowRunPanel(false);
      setView("benchmarks");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setSubmitting(false);
    }
  };

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
          <div className="text-neutral-500 text-xs">
            is the backend running on port 8080?
          </div>
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
            onRunBenchmark={handleOpenRunPanel}
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
                      {selectedRun.status === "running" || selectedRun.status === "queued"
                        ? `run is ${selectedRun.status}…`
                        : "metrics not available -- run not completed"}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs">
                      <div className="text-amber-500 font-bold uppercase mb-2">
                        Run Details
                      </div>
                      <div className="space-y-1">
                        {[
                          ["Run ID", selectedRun.id.slice(0, 8) + "…"],
                          ["Strategy", selectedRun.strategy_name],
                          ["Period", `${selectedRun.start_date} → ${selectedRun.end_date}`],
                          ["Duration", selectedRun.duration_ms ? `${selectedRun.duration_ms}ms` : "--"],
                          ["Status", selectedRun.status],
                          ["Started", selectedRun.started_at.replace("T", " ").slice(0, 19)],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between text-neutral-400">
                            <span className="text-neutral-500">{k}</span>
                            <span
                              className={
                                k === "Status"
                                  ? selectedRun.status === "completed"
                                    ? "text-green-400"
                                    : selectedRun.status === "running"
                                    ? "text-blue-400"
                                    : selectedRun.status === "failed"
                                    ? "text-red-400"
                                    : "text-yellow-400"
                                  : ""
                              }
                            >
                              {v}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs">
                      <div className="text-amber-500 font-bold uppercase mb-2">
                        Quick Stats
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Equity Start</span>
                          <span className="text-neutral-300">
                            $
                            {selectedRun.equity_curve.length > 0
                              ? selectedRun.equity_curve[0].equity.toLocaleString()
                              : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Equity End</span>
                          <span
                            className={
                              (selectedRun.metrics?.total_return_pct ?? 0) > 0
                                ? "text-green-400"
                                : "text-red-400"
                            }
                          >
                            $
                            {selectedRun.equity_curve.length > 0
                              ? selectedRun.equity_curve[
                                  selectedRun.equity_curve.length - 1
                                ].equity.toLocaleString()
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
                <TradeLog
                  trades={selectedRun.trades}
                  strategyFilter={selectedRun.strategy_id}
                />
              </>
            ) : (
              <div className="border border-neutral-700 bg-neutral-950 px-4 py-8 text-center font-mono text-neutral-500 text-sm">
                {runs.length === 0
                  ? "No benchmark runs yet. Click [RUN] in the toolbar to execute a strategy."
                  : "Select a run from the table above to view metrics, equity curves, and trades."}
              </div>
            )}
          </div>
        );

      case "comparison":
        return <ComparisonView runs={runs} />;

      case "trades":
        return <TradeLog trades={allTrades} />;

      case "training":
        return <TrainingView />;

      case "config":
        return <ConfigView strategies={strategies} />;

      case "live":
        return <LiveView />;

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
        {/* Top bar */}
        <div className="h-8 border-b border-neutral-700 bg-neutral-950 flex items-center justify-between px-3 font-mono text-xs shrink-0">
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
          <div className="flex items-center gap-3 text-neutral-500">
            {refreshing && (
              <span className="text-blue-400 animate-pulse">polling…</span>
            )}
            {activeRuns > 0 && (
              <span className="text-yellow-400">
                {activeRuns} run{activeRuns > 1 ? "s" : ""} active
              </span>
            )}
            <span>{new Date().toISOString().slice(0, 19).replace("T", " ")} UTC</span>
            <span className="text-green-400">CONNECTED</span>
            <button
              onClick={handleOpenRunPanel}
              className="border border-amber-600 text-amber-400 hover:bg-amber-900/30 px-2 py-0.5 uppercase tracking-wider"
            >
              RUN
            </button>
          </div>
        </div>

        {/* Inline run panel */}
        {showRunPanel && (
          <div className="border-b border-neutral-700 bg-neutral-950 px-4 py-3 font-mono text-xs">
            <form
              onSubmit={(e) => void handleSubmitRun(e)}
              className="flex items-end gap-4 flex-wrap"
            >
              <div className="text-amber-500 font-bold uppercase self-center">
                New Benchmark Run
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-neutral-500">Strategy</span>
                <select
                  value={runForm.strategyId}
                  onChange={(e) =>
                    setRunForm((f) => ({ ...f, strategyId: e.target.value }))
                  }
                  className="bg-neutral-800 border border-neutral-600 text-neutral-200 px-2 py-1 font-mono text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- select --</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-neutral-500">Start Date</span>
                <input
                  type="date"
                  value={runForm.startDate}
                  onChange={(e) =>
                    setRunForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                  className="bg-neutral-800 border border-neutral-600 text-neutral-200 px-2 py-1 font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-neutral-500">End Date</span>
                <input
                  type="date"
                  value={runForm.endDate}
                  onChange={(e) =>
                    setRunForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                  className="bg-neutral-800 border border-neutral-600 text-neutral-200 px-2 py-1 font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-neutral-500">Capital ($)</span>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={runForm.initialCapital}
                  onChange={(e) =>
                    setRunForm((f) => ({
                      ...f,
                      initialCapital: Number(e.target.value),
                    }))
                  }
                  className="bg-neutral-800 border border-neutral-600 text-neutral-200 px-2 py-1 font-mono text-xs w-28 focus:outline-none focus:border-amber-500"
                />
              </label>

              <div className="flex gap-2 items-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="border border-amber-600 text-amber-400 hover:bg-amber-900/30 disabled:opacity-40 px-3 py-1 uppercase tracking-wider"
                >
                  {submitting ? "Queuing…" : "Execute"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRunPanel(false)}
                  className="border border-neutral-600 text-neutral-400 hover:text-neutral-200 px-3 py-1"
                >
                  Cancel
                </button>
              </div>

              {runError && (
                <span className="text-red-400 self-center">{runError}</span>
              )}
            </form>
          </div>
        )}

        <div className="flex-1 overflow-auto p-3">{renderContent()}</div>
      </div>
    </div>
  );
}
