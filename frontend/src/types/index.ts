// Core domain types for the trading benchmark dashboard

export type StrategyType =
  | "momentum"
  | "mean_reversion"
  | "pairs_trading"
  | "stat_arb"
  | "ml_classifier"
  | "lstm_forecast"
  | "transformer"
  | "reinforcement_learning"
  | "rl_portfolio_optimization"
  | "market_making"
  | "trend_following";

export type StrategyStatus = "idle" | "running" | "completed" | "failed" | "queued";

export type AssetClass = "equity" | "crypto" | "futures" | "options" | "forex";

export interface Strategy {
  id: string;
  name: string;
  type: StrategyType;
  asset_class: AssetClass;
  status: StrategyStatus;
  description: string;
  parameters: Record<string, string | number | boolean>;
  created_at: string;
  updated_at: string;
}

export interface BenchmarkRun {
  id: string;
  strategy_id: string;
  strategy_name: string;
  start_date: string;
  end_date: string;
  status: StrategyStatus;
  duration_ms: number;
  metrics: PerformanceMetrics | null;
  equity_curve: EquityPoint[];
  drawdown_curve: DrawdownPoint[];
  trades: Trade[];
  started_at: string;
  completed_at: string | null;
}

export interface PerformanceMetrics {
  total_return_pct: number;
  annualized_return_pct: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_drawdown_pct: number;
  max_drawdown_duration_days: number;
  volatility_ann_pct: number;
  win_rate_pct: number;
  profit_factor: number;
  total_trades: number;
  avg_trade_return_pct: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  expectancy: number;
  avg_holding_period_hours: number;
  skewness: number;
  kurtosis: number;
  var_95_pct: number;
  cvar_95_pct: number;
  beta: number;
  alpha_ann_pct: number;
  information_ratio: number;
  treynor_ratio: number;
  omega_ratio: number;
  tail_ratio: number;
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
  benchmark: number;
  predicted?: number;
}

export interface DrawdownPoint {
  timestamp: string;
  drawdown_pct: number;
}

export interface Trade {
  id: string;
  strategy_id: string;
  symbol: string;
  side: "long" | "short";
  entry_price: number;
  exit_price: number;
  quantity: number;
  entry_time: string;
  exit_time: string;
  pnl: number;
  pnl_pct: number;
  fees: number;
  slippage: number;
}

export type ViewMode = "overview" | "benchmarks" | "comparison" | "trades" | "training" | "config" | "live" | "paper-trading" | "backtesting";

export interface MarketBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface WatchlistItem {
  symbol: string;
  last: number;
  change: number;
  changePct: number;
  category: string;
}

export interface SortConfig {
  key: string;
  direction: "asc" | "desc";
}
