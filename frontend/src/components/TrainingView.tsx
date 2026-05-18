import { useState, useEffect } from "react";

interface SymbolData {
  symbol: string;
  bar_count: number;
  earliest: string | null;
  latest: string | null;
}

interface TrainingJob {
  status: "idle" | "running" | "completed" | "failed";
  algorithm?: string;
  progress?: number;
  message?: string;
  metrics?: {
    train_sharpe?: number;
    test_sharpe?: number;
    train_return?: number;
    test_return?: number;
    overfitting_score?: number;
  };
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080/api/v1";

export function TrainingView() {
  const [symbols, setSymbols] = useState<SymbolData[]>([]);
  const [job, setJob] = useState<TrainingJob>({ status: "idle" });
  const [form, setForm] = useState({
    algorithm: "ppo",
    selectedSymbols: ["AAPL", "MSFT", "GOOGL"],
    trainRatio: 0.7,
    validationRatio: 0.15,
    timesteps: 100000,
    walksForward: 5,
    earlyStopPatience: 10,
    l2Reg: 0.01,
    dropoutRate: 0.1,
  });

  useEffect(() => {
    fetch(`${BASE}/training/data-summary`)
      .then((r) => r.json())
      .then((data) => setSymbols(data.symbols ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (job.status !== "running") return;
    const interval = setInterval(() => {
      fetch(`${BASE}/training/status`)
        .then((r) => r.json())
        .then((data) => setJob(data))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [job.status]);

  const handleTrain = async () => {
    setJob({ status: "running", algorithm: form.algorithm, progress: 0 });
    try {
      const resp = await fetch(`${BASE}/training/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          algorithm: form.algorithm,
          symbols: form.selectedSymbols,
          train_ratio: form.trainRatio,
          validation_ratio: form.validationRatio,
          timesteps: form.timesteps,
          walk_forward_splits: form.walksForward,
          early_stop_patience: form.earlyStopPatience,
          l2_regularization: form.l2Reg,
          dropout_rate: form.dropoutRate,
          use_db_data: true,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setJob({ status: "failed", message: data.error ?? "Training failed" });
      } else {
        setJob(data);
      }
    } catch (e) {
      setJob({ status: "failed", message: `Connection error: ${e}` });
    }
  };

  const toggleSymbol = (sym: string) => {
    setForm((f) => ({
      ...f,
      selectedSymbols: f.selectedSymbols.includes(sym)
        ? f.selectedSymbols.filter((s) => s !== sym)
        : [...f.selectedSymbols, sym],
    }));
  };

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Data available for training */}
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-2">Available Training Data (from DB)</div>
        <div className="text-neutral-500 mb-2">
          Select symbols from data already stored in the database. No external API calls needed.
        </div>
        {symbols.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {symbols.map((s) => (
              <button
                key={s.symbol}
                onClick={() => toggleSymbol(s.symbol)}
                className={`px-2 py-1.5 border text-left transition-colors ${
                  form.selectedSymbols.includes(s.symbol)
                    ? "border-amber-500 text-amber-400 bg-amber-500/10"
                    : "border-neutral-600 text-neutral-400 hover:border-neutral-400"
                }`}
              >
                <div className="font-bold">{s.symbol}</div>
                <div className="text-[10px] text-neutral-500">
                  {s.bar_count} bars
                  {s.earliest && ` | ${s.earliest.slice(0, 10)}`}
                  {s.latest && ` → ${s.latest.slice(0, 10)}`}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-neutral-500 py-4 text-center">
            No market data in database. Run a benchmark first to auto-fetch data via Alpaca.
          </div>
        )}
      </div>

      {/* Training configuration */}
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-3">Training Configuration</div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-neutral-500 block mb-1">Algorithm</label>
            <select
              value={form.algorithm}
              onChange={(e) => setForm((f) => ({ ...f, algorithm: e.target.value }))}
              className="w-full bg-neutral-900 border border-neutral-600 text-neutral-200 px-2 py-1.5 focus:outline-none focus:border-amber-500"
            >
              <option value="ppo">PPO (Proximal Policy Optimization)</option>
              <option value="sac">SAC (Soft Actor-Critic)</option>
              <option value="a2c">A2C (Advantage Actor-Critic)</option>
              <option value="td3">TD3 (Twin Delayed DDPG)</option>
            </select>
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Timesteps</label>
            <input
              type="number"
              value={form.timesteps}
              min={10000}
              step={10000}
              onChange={(e) => setForm((f) => ({ ...f, timesteps: Number(e.target.value) }))}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Walk-Forward Splits</label>
            <input
              type="number"
              value={form.walksForward}
              min={2}
              max={10}
              onChange={(e) => setForm((f) => ({ ...f, walksForward: Number(e.target.value) }))}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-3">
          <div>
            <label className="text-neutral-500 block mb-1">Train Ratio</label>
            <input
              type="number"
              value={form.trainRatio}
              min={0.5}
              max={0.9}
              step={0.05}
              onChange={(e) => setForm((f) => ({ ...f, trainRatio: Number(e.target.value) }))}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Validation Ratio</label>
            <input
              type="number"
              value={form.validationRatio}
              min={0.05}
              max={0.3}
              step={0.05}
              onChange={(e) => setForm((f) => ({ ...f, validationRatio: Number(e.target.value) }))}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Early Stop Patience</label>
            <input
              type="number"
              value={form.earlyStopPatience}
              min={3}
              max={50}
              onChange={(e) => setForm((f) => ({ ...f, earlyStopPatience: Number(e.target.value) }))}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">L2 Regularization</label>
            <input
              type="number"
              value={form.l2Reg}
              min={0}
              max={0.1}
              step={0.001}
              onChange={(e) => setForm((f) => ({ ...f, l2Reg: Number(e.target.value) }))}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void handleTrain()}
            disabled={job.status === "running" || form.selectedSymbols.length === 0}
            className="border border-amber-600 text-amber-400 hover:bg-amber-900/30 disabled:opacity-40 px-4 py-1.5 uppercase tracking-wider"
          >
            {job.status === "running" ? "Training..." : "Start Training"}
          </button>
          {form.selectedSymbols.length === 0 && (
            <span className="text-red-400">Select at least one symbol</span>
          )}
        </div>
      </div>

      {/* Anti-overfitting measures */}
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-2">Anti-Overfitting Measures</div>
        <div className="grid grid-cols-2 gap-4 text-neutral-400">
          <div className="space-y-1">
            <div className="text-neutral-300 font-bold">Walk-Forward Validation</div>
            <div className="text-[11px]">
              Data is split into {form.walksForward} sequential folds. Each fold trains on prior data
              and tests on the next unseen period. Prevents look-ahead bias.
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-neutral-300 font-bold">Purged Cross-Validation</div>
            <div className="text-[11px]">
              Gap between train/test periods prevents information leakage from autocorrelated
              financial data. Test set is always strictly after training period.
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-neutral-300 font-bold">Early Stopping</div>
            <div className="text-[11px]">
              Training halts if validation Sharpe doesn't improve for {form.earlyStopPatience} epochs.
              Prevents the model from memorizing noise in training data.
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-neutral-300 font-bold">Regularization</div>
            <div className="text-[11px]">
              L2 weight decay ({form.l2Reg}) penalizes large weights.
              Entropy bonus in PPO/A2C encourages exploration over exploitation.
            </div>
          </div>
        </div>
      </div>

      {/* Training status/results */}
      {job.status !== "idle" && (
        <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
          <div className="text-amber-500 font-bold uppercase mb-2">
            Training Status -- {form.algorithm.toUpperCase()}
          </div>

          <div className="flex items-center gap-3 mb-2">
            <span className={`px-2 py-0.5 border ${
              job.status === "running" ? "border-blue-500 text-blue-400" :
              job.status === "completed" ? "border-green-500 text-green-400" :
              job.status === "failed" ? "border-red-500 text-red-400" :
              "border-neutral-500 text-neutral-400"
            }`}>
              {job.status.toUpperCase()}
            </span>
            {job.progress != null && job.status === "running" && (
              <div className="flex-1">
                <div className="h-1.5 bg-neutral-800 rounded">
                  <div
                    className="h-full bg-amber-500 rounded transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {job.message && (
            <div className={`text-${job.status === "failed" ? "red" : "neutral"}-400 mb-2`}>
              {job.message}
            </div>
          )}

          {job.metrics && (
            <div className="grid grid-cols-5 gap-3 border-t border-neutral-700 pt-2 mt-2">
              <div>
                <div className="text-neutral-500 text-[10px] uppercase">Train Sharpe</div>
                <div className="text-neutral-200 font-bold">{job.metrics.train_sharpe?.toFixed(3) ?? "--"}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-[10px] uppercase">Test Sharpe</div>
                <div className={`font-bold ${
                  (job.metrics.test_sharpe ?? 0) > 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {job.metrics.test_sharpe?.toFixed(3) ?? "--"}
                </div>
              </div>
              <div>
                <div className="text-neutral-500 text-[10px] uppercase">Train Return</div>
                <div className="text-neutral-200 font-bold">{job.metrics.train_return?.toFixed(2) ?? "--"}%</div>
              </div>
              <div>
                <div className="text-neutral-500 text-[10px] uppercase">Test Return</div>
                <div className={`font-bold ${
                  (job.metrics.test_return ?? 0) > 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {job.metrics.test_return?.toFixed(2) ?? "--"}%
                </div>
              </div>
              <div>
                <div className="text-neutral-500 text-[10px] uppercase">Overfit Score</div>
                <div className={`font-bold ${
                  (job.metrics.overfitting_score ?? 0) < 0.3 ? "text-green-400" :
                  (job.metrics.overfitting_score ?? 0) < 0.6 ? "text-yellow-400" :
                  "text-red-400"
                }`}>
                  {job.metrics.overfitting_score?.toFixed(3) ?? "--"}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Methodology */}
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-2">Paper Trade Validation</div>
        <div className="text-neutral-400 text-[11px] space-y-1">
          <p>After training, the model is deployed for paper trading using walk-forward out-of-sample periods:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Each walk-forward split simulates real-time: train on past, test on future</li>
            <li>Transaction costs (10bps commission + 5bps slippage) are applied</li>
            <li>Overfitting score = 1 - (test_sharpe / train_sharpe) -- closer to 0 is better</li>
            <li>Model is only deployed to live if test Sharpe {">"} 0.5 and overfit score {"<"} 0.4</li>
            <li>Data is sourced entirely from the local database -- no bias from future data</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
