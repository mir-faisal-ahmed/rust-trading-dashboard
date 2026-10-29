import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Strategy, StrategyTuningJob } from "../types";

interface StrategiesViewProps {
  strategies: Strategy[];
  onRefresh: () => void;
}

const STRATEGY_TYPES: Strategy["type"][] = [
  "momentum",
  "mean_reversion",
  "pairs_trading",
  "stat_arb",
  "ml_classifier",
  "lstm_forecast",
  "transformer",
  "reinforcement_learning",
  "rl_portfolio_optimization",
  "market_making",
  "trend_following",
];

const ASSET_CLASSES: Strategy["asset_class"][] = ["equity", "crypto", "futures", "options", "forex"];

function safePrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function StrategiesView({ strategies, onRefresh }: StrategiesViewProps) {
  const [selectedId, setSelectedId] = useState<string>(strategies[0]?.id ?? "");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<StrategyTuningJob[]>([]);

  const selected = useMemo(
    () => strategies.find((strategy) => strategy.id === selectedId) ?? null,
    [strategies, selectedId]
  );

  useEffect(() => {
    if (!selectedId && strategies[0]) {
      setSelectedId(strategies[0].id);
    }
  }, [strategies, selectedId]);

  const [name, setName] = useState(selected?.name ?? "");
  const [type, setType] = useState<Strategy["type"]>(selected?.type ?? "trend_following");
  const [assetClass, setAssetClass] = useState<Strategy["asset_class"]>(selected?.asset_class ?? "equity");
  const [description, setDescription] = useState(selected?.description ?? "");
  const [parameters, setParameters] = useState(safePrettyJson(selected?.parameters ?? {}));
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [initialCapital, setInitialCapital] = useState("100000");
  const [objective, setObjective] = useState("sharpe_ratio");
  const [parameterGrid, setParameterGrid] = useState('{"lookback_days": [63, 126], "risk_fraction_per_position": [0.08, 0.12, 0.16]}');
  const [modelHints, setModelHints] = useState("meta/llama-3.3-70b-instruct, qwen/qwen2.5-72b-instruct");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setType(selected.type);
    setAssetClass(selected.asset_class);
    setDescription(selected.description);
    setParameters(safePrettyJson(selected.parameters ?? {}));
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) {
      setJobs([]);
      return;
    }
    let mounted = true;
    api.strategies
      .listTuningJobs(selected.id)
      .then((items) => {
        if (mounted) setJobs(items);
      })
      .catch(() => {
        if (mounted) setJobs([]);
      });
    return () => {
      mounted = false;
    };
  }, [selected?.id]);

  const visibleStrategies = useMemo(
    () => strategies.filter((strategy) => showInactive || strategy.is_active !== false),
    [strategies, showInactive]
  );

  const setBusy = (nextLoading: boolean) => {
    setLoading(nextLoading);
    if (nextLoading) {
      setError(null);
      setMessage(null);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.strategies.update(selected.id, {
        name,
        strategy_type: type,
        asset_class: assetClass,
        description,
        parameters: parseJson(parameters, selected.parameters),
      });
      setMessage("Strategy updated in database.");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update strategy");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    const ok = window.confirm(
      `Retire ${selected.name}? This removes it from active DB listings and may delete the source file when enabled.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.strategies.retire(selected.id);
      setMessage("Strategy retired.");
      onRefresh();
      setSelectedId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to retire strategy");
    } finally {
      setLoading(false);
    }
  };

  const handleManualRun = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.benchmarks.create({
        strategy_id: selected.id,
        start_date: startDate,
        end_date: endDate,
        initial_capital: Number(initialCapital),
      });
      setMessage("Manual benchmark queued.");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue benchmark");
    } finally {
      setLoading(false);
    }
  };

  const handleAutoTune = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const grid = parseJson<Record<string, unknown[]>>(parameterGrid, {});
      await api.backtest.optimize({
        strategy_id: selected.id,
        start_date: startDate,
        end_date: endDate,
        param_grid: grid,
        optimize_metric: objective,
      });
      setMessage("Auto-tuning runs queued.");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue auto tuning");
    } finally {
      setLoading(false);
    }
  };

  const handleLlmTune = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const hintList = modelHints
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      await api.strategies.createTuningJob(selected.id, {
        mode: "llm",
        objective,
        parameter_grid: parseJson<Record<string, unknown>>(parameterGrid, {}),
        model_hints: hintList,
        notes,
        backtest_date_from: startDate,
        backtest_date_to: endDate,
      });
      setMessage("LLM tuning job saved to database.");
      onRefresh();
      const refreshed = await api.strategies.listTuningJobs(selected.id);
      setJobs(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue LLM tuning");
    } finally {
      setLoading(false);
    }
  };

  if (!selected && strategies.length === 0) {
    return (
      <div className="border border-neutral-700 bg-neutral-950 p-4 font-mono text-xs text-neutral-500">
        No strategies available.
      </div>
    );
  }

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Compact strategy selector */}
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-amber-500 font-bold uppercase">Strategies</div>
            <div className="text-neutral-500 text-[10px]">Edit, retire, and queue manual / auto / LLM tuning jobs.</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-neutral-400 text-[10px]">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              inactive
            </label>
            {/* Compact dropdown selector */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="border border-neutral-600 bg-neutral-800 text-neutral-200 px-2 py-1 flex items-center gap-2 hover:border-amber-600 transition-colors min-w-[160px] justify-between"
              >
                <span className="truncate">{selected?.name ?? "-- select strategy --"}</span>
                <span className="text-neutral-500 text-[10px] shrink-0">{dropdownOpen ? "▲" : "▼"}</span>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 border border-neutral-700 bg-neutral-950 min-w-[220px] max-h-64 overflow-y-auto shadow-lg">
                  <div className="px-2 py-1 border-b border-neutral-800 text-neutral-500 text-[9px] uppercase">
                    {visibleStrategies.length} strategies
                  </div>
                  {visibleStrategies.map((strategy) => {
                    const statusColor =
                      strategy.status === "running" ? "text-blue-400"
                      : strategy.status === "retired" ? "text-neutral-500"
                      : strategy.status === "failed" ? "text-red-400"
                      : "text-neutral-300";
                    return (
                      <label
                        key={strategy.id}
                        className={`flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-900 cursor-pointer ${selected?.id === strategy.id ? "bg-neutral-800" : ""}`}
                        onClick={() => { setSelectedId(strategy.id); setDropdownOpen(false); }}
                      >
                        <input
                          type="radio"
                          name="strategy-select"
                          checked={selected?.id === strategy.id}
                          onChange={() => { setSelectedId(strategy.id); setDropdownOpen(false); }}
                          className="accent-amber-500 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-neutral-200 truncate">{strategy.name}</div>
                          <div className="flex gap-2 text-[9px]">
                            <span className="text-neutral-600">{strategy.type}</span>
                            <span className={statusColor}>{strategy.status}</span>
                            {strategy.code_key && (
                              <span className="text-neutral-600">{strategy.code_key}</span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  {visibleStrategies.length === 0 && (
                    <div className="px-2 py-3 text-neutral-600 text-center">No strategies</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <>
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-neutral-700 bg-neutral-950 p-3 space-y-3">
            <div className="text-amber-500 font-bold uppercase">Selected Strategy</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-neutral-500">Name</span>
                <input className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-neutral-500">Type</span>
                <select className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200" value={type} onChange={(e) => setType(e.target.value as Strategy["type"])}>
                  {STRATEGY_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-neutral-500">Asset Class</span>
                <select className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200" value={assetClass} onChange={(e) => setAssetClass(e.target.value as Strategy["asset_class"])}>
                  {ASSET_CLASSES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-neutral-500">Benchmark Start</span>
                <input type="date" className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-neutral-500">Benchmark End</span>
                <input type="date" className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-neutral-500">Capital</span>
                <input type="number" className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200" value={initialCapital} onChange={(e) => setInitialCapital(e.target.value)} />
              </label>
            </div>
            <label className="space-y-1 block">
              <span className="text-neutral-500">Description</span>
              <textarea className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="space-y-1 block">
              <span className="text-neutral-500">Parameters JSON</span>
              <textarea className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 min-h-40 font-mono" value={parameters} onChange={(e) => setParameters(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={loading} onClick={() => void handleSave()} className="px-3 py-1.5 border border-green-700 text-green-400 hover:bg-green-900/30 disabled:opacity-40">Save</button>
              <button type="button" disabled={loading} onClick={() => void handleManualRun()} className="px-3 py-1.5 border border-blue-700 text-blue-400 hover:bg-blue-900/30 disabled:opacity-40">Run Manual</button>
              <button type="button" disabled={loading} onClick={() => void handleAutoTune()} className="px-3 py-1.5 border border-amber-700 text-amber-400 hover:bg-amber-900/30 disabled:opacity-40">Auto Tune</button>
              <button type="button" disabled={loading} onClick={() => void handleLlmTune()} className="px-3 py-1.5 border border-purple-700 text-purple-400 hover:bg-purple-900/30 disabled:opacity-40">LLM Tune</button>
              <button type="button" disabled={loading} onClick={() => void handleDelete()} className="px-3 py-1.5 border border-red-700 text-red-400 hover:bg-red-900/30 disabled:opacity-40">Delete</button>
            </div>
            {message && <div className="text-green-400">{message}</div>}
            {error && <div className="text-red-400">{error}</div>}
          </div>

          <div className="border border-neutral-700 bg-neutral-950 p-3 space-y-3">
            <div className="text-amber-500 font-bold uppercase">Tuning Controls</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 col-span-2">
                <span className="text-neutral-500">Parameter Grid JSON</span>
                <textarea className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 min-h-28 font-mono" value={parameterGrid} onChange={(e) => setParameterGrid(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-neutral-500">Objective</span>
                <select className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200" value={objective} onChange={(e) => setObjective(e.target.value)}>
                  <option value="sharpe_ratio">Sharpe Ratio</option>
                  <option value="sortino_ratio">Sortino Ratio</option>
                  <option value="total_return_pct">Total Return %</option>
                  <option value="profit_factor">Profit Factor</option>
                  <option value="max_drawdown_pct">Min Max Drawdown</option>
                  <option value="calmar_ratio">Calmar Ratio</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-neutral-500">LLM Models</span>
                <input className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200" value={modelHints} onChange={(e) => setModelHints(e.target.value)} />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-neutral-500">Notes</span>
                <textarea className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Capture why this tuning run exists so future sessions can resume cleanly." />
              </label>
            </div>

            <div className="border-t border-neutral-800 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-neutral-400 uppercase text-[10px]">Tuning Jobs</div>
                <div className="text-neutral-500">{jobs.length} jobs</div>
              </div>
              <div className="space-y-2 max-h-80 overflow-auto">
                {jobs.map((job) => (
                  <div key={job.id} className="border border-neutral-800 bg-neutral-900/40 px-2 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-200">{job.mode}</span>
                      <span className={job.status === "completed" ? "text-green-400" : job.status === "running" ? "text-blue-400" : job.status === "failed" ? "text-red-400" : "text-amber-400"}>
                        {job.status}
                      </span>
                    </div>
                    <div className="text-neutral-500 text-[10px]">objective: {job.objective}</div>
                    <div className="text-neutral-500 text-[10px]">created: {job.created_at.slice(0, 19).replace("T", " ")}</div>
                    {(job.model_name || job.parameter_hash) && (
                      <div className="text-neutral-500 text-[10px]">
                        model/hash: {job.model_name ?? "--"} / {job.parameter_hash ? job.parameter_hash.slice(0, 8) : "--"}
                      </div>
                    )}
                    {job.backtest_date_from && job.backtest_date_to && (
                      <div className="text-neutral-500 text-[10px]">
                        backtest window: {job.backtest_date_from} to {job.backtest_date_to}
                      </div>
                    )}
                    {job.mode === "llm" &&
                      Array.isArray(job.results?.agents) &&
                      (job.results?.agents as Array<{ name?: string }>).length > 0 && (
                        <div className="text-neutral-500 text-[10px]">
                          moa agents: {(job.results?.agents as Array<{ name?: string }>)
                            .map((agent) => agent.name)
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      )}
                    {job.notes && <div className="text-neutral-400 text-[10px] mt-1">{job.notes}</div>}
                  </div>
                ))}
                {jobs.length === 0 && <div className="text-neutral-500">No tuning jobs yet.</div>}
              </div>
            </div>
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="border border-neutral-700 bg-neutral-950 p-3">
            <div className="text-amber-500 font-bold uppercase mb-2">Tuning Leaderboard</div>
            <div className="overflow-auto border border-neutral-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-700 text-neutral-500">
                    <th className="px-2 py-1 text-left font-normal">#</th>
                    <th className="px-2 py-1 text-left font-normal">MODE</th>
                    <th className="px-2 py-1 text-left font-normal">STATUS</th>
                    <th className="px-2 py-1 text-left font-normal">OBJECTIVE</th>
                    <th className="px-2 py-1 text-right font-normal">BEST METRIC</th>
                    <th className="px-2 py-1 text-left font-normal">MODEL</th>
                    <th className="px-2 py-1 text-left font-normal">PARAM SHA</th>
                    <th className="px-2 py-1 text-left font-normal">DATES</th>
                  </tr>
                </thead>
                <tbody>
                  {[...jobs]
                    .filter((j) => j.status === "completed")
                    .sort((a, b) => (b.best_metric_value ?? 0) - (a.best_metric_value ?? 0))
                    .map((job, i) => (
                      <tr key={job.id} className="border-b border-neutral-800 hover:bg-neutral-900">
                        <td className="px-2 py-1 text-neutral-500">{i + 1}</td>
                        <td className="px-2 py-1 text-neutral-300">{job.mode}</td>
                        <td className="px-2 py-1 text-green-400">{job.status}</td>
                        <td className="px-2 py-1 text-neutral-400">{job.objective}</td>
                        <td className={`px-2 py-1 text-right ${job.best_metric_value !== undefined && job.best_metric_value !== null && job.best_metric_value > 0 ? "text-green-400" : "text-neutral-400"}`}>
                          {job.best_metric_value != null ? job.best_metric_value.toFixed(4) : "--"}
                        </td>
                        <td className="px-2 py-1 text-neutral-400">{job.model_name ?? "--"}</td>
                        <td className="px-2 py-1 text-neutral-500 font-mono text-[9px]">{job.parameter_hash ? job.parameter_hash.slice(0, 8) : "--"}</td>
                        <td className="px-2 py-1 text-neutral-500">
                          {job.backtest_date_from && job.backtest_date_to ? `${job.backtest_date_from}…${job.backtest_date_to}` : "--"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-neutral-500 text-[10px]">
              Leaderboard shows completed tuning jobs. Use model name + param SHA for reproducibility.
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
