// Generates deterministic mock data that resembles realistic backtesting output.
// This will be replaced by API calls to the Rust backend in production.

import type {
  Strategy,
  BenchmarkRun,
  PerformanceMetrics,
  EquityPoint,
  DrawdownPoint,
  Trade,
} from "../types";

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export const strategies: Strategy[] = [
  {
    id: "strat-001",
    name: "RSI Mean Reversion",
    type: "mean_reversion",
    asset_class: "equity",
    status: "completed",
    description: "Mean reversion on RSI oversold/overbought with ATR-based stops",
    parameters: { rsi_period: 14, oversold: 30, overbought: 70, atr_multiplier: 2.0 },
    created_at: "2024-11-15T08:00:00Z",
    updated_at: "2025-01-20T14:30:00Z",
  },
  {
    id: "strat-002",
    name: "Dual Momentum Cross",
    type: "momentum",
    asset_class: "equity",
    status: "completed",
    description: "Absolute and relative momentum using 12-month lookback with 1-month rebalance",
    parameters: { lookback_months: 12, rebalance_freq: "monthly", universe_size: 100 },
    created_at: "2024-11-20T10:00:00Z",
    updated_at: "2025-01-18T09:15:00Z",
  },
  {
    id: "strat-003",
    name: "Cointegration Pairs",
    type: "pairs_trading",
    asset_class: "equity",
    status: "completed",
    description: "Johansen cointegration test with Kalman filter hedge ratios on sector ETFs",
    parameters: { lookback_days: 252, zscore_entry: 2.0, zscore_exit: 0.5, max_pairs: 15 },
    created_at: "2024-12-01T12:00:00Z",
    updated_at: "2025-01-22T11:45:00Z",
  },
  {
    id: "strat-004",
    name: "XGBoost Classifier v3",
    type: "ml_classifier",
    asset_class: "equity",
    status: "completed",
    description: "Gradient boosted tree classifier on 47 technical features, 5-day forward return target",
    parameters: { n_estimators: 500, max_depth: 6, learning_rate: 0.05, min_samples: 50 },
    created_at: "2024-12-10T08:30:00Z",
    updated_at: "2025-01-21T16:00:00Z",
  },
  {
    id: "strat-005",
    name: "LSTM Price Forecast",
    type: "lstm_forecast",
    asset_class: "crypto",
    status: "completed",
    description: "3-layer LSTM with attention mechanism on OHLCV + orderbook imbalance features",
    parameters: { hidden_size: 128, num_layers: 3, dropout: 0.2, sequence_length: 60 },
    created_at: "2024-12-15T09:00:00Z",
    updated_at: "2025-01-19T13:20:00Z",
  },
  {
    id: "strat-006",
    name: "Transformer Alpha",
    type: "transformer",
    asset_class: "crypto",
    status: "running",
    description: "Temporal fusion transformer for multi-horizon crypto forecasting with sentiment inputs",
    parameters: { d_model: 256, n_heads: 8, n_layers: 4, context_window: 120 },
    created_at: "2025-01-05T07:00:00Z",
    updated_at: "2025-01-23T10:00:00Z",
  },
  {
    id: "strat-007",
    name: "PPO Market Maker",
    type: "reinforcement_learning",
    asset_class: "crypto",
    status: "queued",
    description: "Proximal policy optimization agent for market making with inventory risk penalty",
    parameters: { gamma: 0.99, clip_epsilon: 0.2, lr_actor: 0.0003, inventory_limit: 100 },
    created_at: "2025-01-10T14:00:00Z",
    updated_at: "2025-01-23T08:00:00Z",
  },
  {
    id: "strat-008",
    name: "Turtle Breakout",
    type: "trend_following",
    asset_class: "futures",
    status: "completed",
    description: "Modified turtle trading system with 20/55 day breakout and ATR position sizing",
    parameters: { fast_period: 20, slow_period: 55, atr_period: 20, risk_per_trade: 0.01 },
    created_at: "2024-10-05T11:00:00Z",
    updated_at: "2025-01-17T15:30:00Z",
  },
  {
    id: "strat-009",
    name: "Stat Arb Residuals",
    type: "stat_arb",
    asset_class: "equity",
    status: "completed",
    description: "PCA-based statistical arbitrage on residual returns with daily rebalancing",
    parameters: { n_components: 5, lookback: 120, entry_threshold: 1.5, exit_threshold: 0.3 },
    created_at: "2024-11-25T13:00:00Z",
    updated_at: "2025-01-20T10:10:00Z",
  },
  {
    id: "strat-010",
    name: "LLM Sentiment Alpha",
    type: "transformer",
    asset_class: "equity",
    status: "failed",
    description: "Fine-tuned Llama-3 for earnings call sentiment scoring mapped to 5-day forward returns",
    parameters: { model: "llama-3-8b", max_tokens: 512, temperature: 0.1, top_k: 50 },
    created_at: "2025-01-08T09:00:00Z",
    updated_at: "2025-01-22T17:45:00Z",
  },
];

function generateEquityCurve(
  days: number,
  annReturn: number,
  volatility: number,
  seed: number
): { equity: EquityPoint[]; drawdown: DrawdownPoint[] } {
  const localRng = seededRandom(seed);
  const dailyReturn = annReturn / 252;
  const dailyVol = volatility / Math.sqrt(252);
  const equity: EquityPoint[] = [];
  const drawdown: DrawdownPoint[] = [];
  let value = 100000;
  let benchValue = 100000;
  let peak = value;
  const startDate = new Date("2023-01-03");

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const noise = (localRng() - 0.5) * 2;
    const ret = dailyReturn + dailyVol * noise;
    value = value * (1 + ret);

    const benchNoise = (localRng() - 0.5) * 2;
    const benchRet = 0.10 / 252 + (0.16 / Math.sqrt(252)) * benchNoise;
    benchValue = benchValue * (1 + benchRet);

    if (value > peak) peak = value;
    const dd = ((value - peak) / peak) * 100;

    equity.push({
      timestamp: date.toISOString().split("T")[0],
      equity: roundTo(value, 2),
      benchmark: roundTo(benchValue, 2),
    });
    drawdown.push({
      timestamp: date.toISOString().split("T")[0],
      drawdown_pct: roundTo(dd, 2),
    });
  }
  return { equity, drawdown };
}

function generateTrades(strategyId: string, count: number, seed: number): Trade[] {
  const localRng = seededRandom(seed);
  const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM", "V", "UNH",
    "BTC-USD", "ETH-USD", "SOL-USD", "ES", "NQ", "CL", "GC", "ZB"];
  const trades: Trade[] = [];

  for (let i = 0; i < count; i++) {
    const symbol = symbols[Math.floor(localRng() * symbols.length)];
    const side = localRng() > 0.45 ? "long" as const : "short" as const;
    const entryPrice = roundTo(50 + localRng() * 450, 2);
    const pnlPct = roundTo((localRng() - 0.42) * 8, 2);
    const exitPrice = roundTo(entryPrice * (1 + pnlPct / 100), 2);
    const quantity = Math.floor(10 + localRng() * 990);
    const pnl = roundTo((exitPrice - entryPrice) * quantity * (side === "long" ? 1 : -1), 2);
    const entryDate = new Date("2023-01-03");
    entryDate.setDate(entryDate.getDate() + Math.floor(localRng() * 500));
    const holdHours = 1 + Math.floor(localRng() * 240);
    const exitDate = new Date(entryDate.getTime() + holdHours * 3600000);

    trades.push({
      id: `trade-${strategyId}-${i.toString().padStart(4, "0")}`,
      strategy_id: strategyId,
      symbol,
      side,
      entry_price: entryPrice,
      exit_price: exitPrice,
      quantity,
      entry_time: entryDate.toISOString(),
      exit_time: exitDate.toISOString(),
      pnl,
      pnl_pct: side === "long" ? pnlPct : -pnlPct,
      fees: roundTo(Math.abs(pnl) * 0.001, 2),
      slippage: roundTo(Math.abs(pnl) * 0.0005, 2),
    });
  }

  trades.sort((a, b) => new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime());
  return trades;
}

function generateMetrics(seed: number): PerformanceMetrics {
  const r = seededRandom(seed);
  const totalReturn = roundTo((r() - 0.3) * 120, 2);
  const annReturn = roundTo(totalReturn / 2, 2);
  const vol = roundTo(8 + r() * 30, 2);
  const sharpe = roundTo(annReturn / vol, 2);
  const maxDD = roundTo(-(5 + r() * 35), 2);
  const winRate = roundTo(35 + r() * 35, 1);
  const avgWin = roundTo(0.5 + r() * 4, 2);
  const avgLoss = roundTo(-(0.3 + r() * 2.5), 2);
  const profitFactor = winRate > 50 ? roundTo(1 + r() * 2.5, 2) : roundTo(0.5 + r() * 1.0, 2);

  return {
    total_return_pct: totalReturn,
    annualized_return_pct: annReturn,
    sharpe_ratio: sharpe,
    sortino_ratio: roundTo(sharpe * (1 + r() * 0.5), 2),
    calmar_ratio: roundTo(Math.abs(annReturn / maxDD), 2),
    max_drawdown_pct: maxDD,
    max_drawdown_duration_days: Math.floor(10 + r() * 180),
    volatility_ann_pct: vol,
    win_rate_pct: winRate,
    profit_factor: profitFactor,
    total_trades: Math.floor(50 + r() * 2000),
    avg_trade_return_pct: roundTo((r() - 0.4) * 2, 3),
    avg_win_pct: avgWin,
    avg_loss_pct: avgLoss,
    expectancy: roundTo((winRate / 100) * avgWin + (1 - winRate / 100) * avgLoss, 3),
    avg_holding_period_hours: roundTo(1 + r() * 480, 1),
    skewness: roundTo((r() - 0.5) * 2, 2),
    kurtosis: roundTo(2 + r() * 6, 2),
    var_95_pct: roundTo(-(1 + r() * 4), 2),
    cvar_95_pct: roundTo(-(1.5 + r() * 6), 2),
    beta: roundTo(0.2 + r() * 1.5, 2),
    alpha_ann_pct: roundTo((r() - 0.3) * 20, 2),
    information_ratio: roundTo((r() - 0.3) * 2, 2),
    treynor_ratio: roundTo((r() - 0.2) * 15, 2),
    omega_ratio: roundTo(0.8 + r() * 1.5, 2),
    tail_ratio: roundTo(0.5 + r() * 2, 2),
  };
}

export const benchmarkRuns: BenchmarkRun[] = strategies
  .filter((s) => s.status === "completed" || s.status === "running")
  .map((s, idx) => {
    const metrics = generateMetrics(idx * 7 + 13);
    const curves = generateEquityCurve(
      504,
      metrics.annualized_return_pct / 100,
      metrics.volatility_ann_pct / 100,
      idx * 11 + 5
    );
    const trades = generateTrades(s.id, Math.min(metrics.total_trades, 200), idx * 13 + 3);

    return {
      id: `bench-${idx.toString().padStart(3, "0")}`,
      strategy_id: s.id,
      strategy_name: s.name,
      start_date: "2023-01-03",
      end_date: "2024-12-31",
      status: s.status,
      duration_ms: Math.floor(500 + Math.random() * 15000),
      metrics,
      equity_curve: curves.equity,
      drawdown_curve: curves.drawdown,
      trades,
      started_at: s.updated_at,
      completed_at: s.status === "completed" ? s.updated_at : null,
    };
  });
