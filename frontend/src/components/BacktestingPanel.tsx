import { useState } from "react";
import { api } from "../api/client";
import type { Strategy } from "../types";
import type { WalkForwardResponse, BatchBacktestResponse, ParamOptimizeResponse } from "../api/client";

interface BacktestingPanelProps {
  strategies: Strategy[];
  onRunComplete?: () => void;
}

export function BacktestingPanel({ strategies, onRunComplete }: BacktestingPanelProps) {
  const [mode, setMode] = useState<"single" | "batch" | "walk-forward" | "optimize">("single");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Single / common params
  const [strategyId, setStrategyId] = useState("");
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [capital, setCapital] = useState("100000");

  // Walk-forward params
  const [trainDays, setTrainDays] = useState("180");
  const [testDays, setTestDays] = useState("60");

  // Batch params
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);

  // Optimize params
  const [paramGrid, setParamGrid] = useState<string>('{"rsi_period": [10, 14, 20], "fast_ema_period": [5, 9, 12]}');
  const [optimizeMetric, setOptimizeMetric] = useState("sharpe_ratio");

  const handleSingleRun = async () => {
    if (!strategyId) return;
    setLoading(true);
    setError(null);
    try {
      await api.benchmarks.create({
        strategy_id: strategyId,
        start_date: startDate,
        end_date: endDate,
        initial_capital: parseFloat(capital),
      });
      setResult("Backtest started successfully");
      onRunComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleWalkForward = async () => {
    if (!strategyId) return;
    setLoading(true);
    setError(null);
    try {
      const resp: WalkForwardResponse = await api.backtest.walkForward({
        strategy_id: strategyId,
        start_date: startDate,
        end_date: endDate,
        train_window_days: parseInt(trainDays),
        test_window_days: parseInt(testDays),
        initial_capital: parseFloat(capital),
      });
      setResult(`Walk-forward: ${resp.total_runs} windows created`);
      onRunComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBatch = async () => {
    if (selectedStrategies.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const resp: BatchBacktestResponse = await api.backtest.batch({
        strategy_ids: selectedStrategies,
        start_date: startDate,
        end_date: endDate,
        initial_capital: parseFloat(capital),
      });
      setResult(`Batch: ${resp.total} runs queued`);
      onRunComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!strategyId) return;
    setLoading(true);
    setError(null);
    try {
      const grid = JSON.parse(paramGrid);
      const resp: ParamOptimizeResponse = await api.backtest.optimize({
        strategy_id: strategyId,
        start_date: startDate,
        end_date: endDate,
        param_grid: grid,
        optimize_metric: optimizeMetric,
      });
      setResult(`Optimization: ${resp.total_combinations} combinations queued (${resp.optimize_metric})`);
      onRunComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start optimization");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    switch (mode) {
      case "single":
        void handleSingleRun();
        break;
      case "walk-forward":
        void handleWalkForward();
        break;
      case "batch":
        void handleBatch();
        break;
      case "optimize":
        void handleOptimize();
        break;
    }
  };

  return (
    <div className="border border-neutral-700 bg-neutral-950 p-4 font-mono text-xs space-y-4">
      <div className="text-amber-500 font-bold uppercase text-sm">Backtesting Engine</div>

      {/* Mode selector */}
      <div className="flex gap-2">
        {(["single", "batch", "walk-forward", "optimize"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 uppercase ${
              mode === m
                ? "bg-amber-900/30 border border-amber-600 text-amber-400"
                : "border border-neutral-600 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Common parameters */}
      <div className="grid grid-cols-4 gap-3">
        {mode !== "batch" && (
          <div>
            <label className="text-neutral-500 block mb-1">Strategy</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200"
            >
              <option value="">Select...</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="text-neutral-500 block mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-neutral-500 block mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-neutral-500 block mb-1">Capital ($)</label>
          <input
            type="text"
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Mode-specific parameters */}
      {mode === "walk-forward" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-neutral-500 block mb-1">Train Window (days)</label>
            <input
              type="text"
              value={trainDays}
              onChange={(e) => setTrainDays(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Test Window (days)</label>
            <input
              type="text"
              value={testDays}
              onChange={(e) => setTestDays(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {mode === "batch" && (
        <div>
          <label className="text-neutral-500 block mb-1">Select Strategies</label>
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-auto border border-neutral-700 p-2">
            {strategies.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-neutral-300 cursor-pointer hover:text-neutral-100">
                <input
                  type="checkbox"
                  checked={selectedStrategies.includes(s.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedStrategies((prev) => [...prev, s.id]);
                    } else {
                      setSelectedStrategies((prev) => prev.filter((id) => id !== s.id));
                    }
                  }}
                  className="accent-amber-500"
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {mode === "optimize" && (
        <div className="space-y-3">
          <div>
            <label className="text-neutral-500 block mb-1">Parameter Grid (JSON)</label>
            <textarea
              value={paramGrid}
              onChange={(e) => setParamGrid(e.target.value)}
              rows={3}
              className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none font-mono"
              placeholder='{"param_name": [val1, val2, ...]}'
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Optimize For</label>
            <select
              value={optimizeMetric}
              onChange={(e) => setOptimizeMetric(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200"
            >
              <option value="sharpe_ratio">Sharpe Ratio</option>
              <option value="sortino_ratio">Sortino Ratio</option>
              <option value="total_return_pct">Total Return %</option>
              <option value="max_drawdown_pct">Min Max Drawdown</option>
              <option value="profit_factor">Profit Factor</option>
              <option value="calmar_ratio">Calmar Ratio</option>
              <option value="omega_ratio">Omega Ratio</option>
            </select>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 bg-amber-900/30 border border-amber-600 text-amber-400 hover:bg-amber-900/50 font-bold uppercase disabled:opacity-50"
        >
          {loading ? "RUNNING..." : `RUN ${mode.toUpperCase()}`}
        </button>
        {result && <span className="text-green-400">{result}</span>}
        {error && <span className="text-red-400">{error}</span>}
      </div>
    </div>
  );
}
