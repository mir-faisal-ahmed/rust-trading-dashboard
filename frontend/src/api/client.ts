import type {
  Strategy,
  BenchmarkRun,
  EquityPoint,
  DrawdownPoint,
  Trade,
  PerformanceMetrics,
} from "../types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080/api/v1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `POST ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `DELETE ${path} → ${res.status}`);
  }
}

// ---- mappers: align backend field names with frontend types ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStrategy(raw: any): Strategy {
  return {
    id: raw.id as string,
    name: raw.name as string,
    type: raw.strategy_type as Strategy["type"],
    asset_class: raw.asset_class as Strategy["asset_class"],
    status: raw.status as Strategy["status"],
    description: raw.description as string,
    parameters: raw.parameters as Record<string, string | number | boolean>,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMetrics(raw: any): PerformanceMetrics {
  return {
    total_return_pct: raw.total_return_pct,
    annualized_return_pct: raw.annualized_return_pct,
    sharpe_ratio: raw.sharpe_ratio,
    sortino_ratio: raw.sortino_ratio,
    calmar_ratio: raw.calmar_ratio,
    max_drawdown_pct: raw.max_drawdown_pct,
    max_drawdown_duration_days: raw.max_drawdown_duration_days,
    volatility_ann_pct: raw.volatility_ann_pct,
    win_rate_pct: raw.win_rate_pct,
    profit_factor: raw.profit_factor,
    total_trades: raw.total_trades,
    avg_trade_return_pct: raw.avg_trade_return_pct,
    avg_win_pct: raw.avg_win_pct,
    avg_loss_pct: raw.avg_loss_pct,
    expectancy: raw.expectancy,
    avg_holding_period_hours: raw.avg_holding_period_hours,
    skewness: raw.skewness,
    kurtosis: raw.kurtosis,
    var_95_pct: raw.var_95_pct,
    cvar_95_pct: raw.cvar_95_pct,
    beta: raw.beta,
    alpha_ann_pct: raw.alpha_ann_pct,
    information_ratio: raw.information_ratio,
    treynor_ratio: raw.treynor_ratio,
    omega_ratio: raw.omega_ratio,
    tail_ratio: raw.tail_ratio,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRun(raw: any): BenchmarkRun {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshots: any[] = raw.equity_snapshots ?? [];

  const equity_curve: EquityPoint[] = snapshots.map((s) => ({
    timestamp: (s.timestamp as string).slice(0, 10),
    equity: s.equity as number,
    benchmark: s.benchmark_equity as number,
    predicted: s.predicted_equity != null ? (s.predicted_equity as number) : undefined,
  }));

  const drawdown_curve: DrawdownPoint[] = snapshots.map((s) => ({
    timestamp: (s.timestamp as string).slice(0, 10),
    drawdown_pct: s.drawdown_pct as number,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trades: Trade[] = (raw.trades ?? []).map((t: any) => ({
    id: t.id as string,
    strategy_id: t.strategy_id as string,
    symbol: t.symbol as string,
    side: t.side as "long" | "short",
    entry_price: t.entry_price as number,
    exit_price: t.exit_price as number,
    quantity: t.quantity as number,
    entry_time: t.entry_time as string,
    exit_time: t.exit_time as string,
    pnl: t.pnl as number,
    pnl_pct: t.pnl_pct as number,
    fees: t.fees as number,
    slippage: t.slippage as number,
  }));

  return {
    id: raw.id as string,
    strategy_id: raw.strategy_id as string,
    strategy_name: raw.strategy_name as string,
    start_date: raw.start_date as string,
    end_date: raw.end_date as string,
    status: raw.status as BenchmarkRun["status"],
    duration_ms: (raw.duration_ms as number | null) ?? 0,
    metrics: raw.metrics ? mapMetrics(raw.metrics) : null,
    equity_curve,
    drawdown_curve,
    trades,
    started_at: raw.started_at as string,
    completed_at: (raw.completed_at as string | null) ?? null,
  };
}

// ---- public API ----

export const api = {
  strategies: {
    list: async (opts?: { includeInactive?: boolean }): Promise<Strategy[]> => {
      const query = opts?.includeInactive ? "?include_inactive=true" : "";
      const raw = await get<unknown[]>(`/strategies${query}`);
      return raw.map(mapStrategy);
    },
    retire: (id: string) => del(`/strategies/${id}`),
  },
  benchmarks: {
    listFull: async (): Promise<BenchmarkRun[]> => {
      const raw = await get<unknown[]>("/benchmarks/full");
      return raw.map(mapRun);
    },
    getFull: async (id: string): Promise<BenchmarkRun> => {
      const raw = await get<unknown>(`/benchmarks/${id}/full`);
      return mapRun(raw);
    },
    create: (body: {
      strategy_id: string;
      start_date: string;
      end_date: string;
      initial_capital?: number;
      commission_bps?: number;
      slippage_bps?: number;
    }) => post<{ id: string; status: string }>("/benchmarks", body),
  },
  marketData: {
    status: () => get<MarketDataStatus>("/market-data/status"),
    fetch: (body: {
      symbol: string;
      timeframe: string;
      start: string;
      end: string;
      crypto?: boolean;
    }) => post<unknown>("/market-data/fetch", body),
    getBars: (symbol: string, params?: { timeframe?: string; limit?: number; start?: string; end?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.timeframe) searchParams.set("timeframe", params.timeframe);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.start) searchParams.set("start", params.start);
      if (params?.end) searchParams.set("end", params.end);
      const qs = searchParams.toString();
      return get<{ symbol: string; timeframe: string; bars: { t: string; o: number; h: number; l: number; c: number; v: number }[] }>(
        `/market-data/${encodeURIComponent(symbol)}${qs ? `?${qs}` : ""}`
      );
    },
  },
  // ── Paper Trading API ──
  trading: {
    getAccount: () => get<PaperAccount>("/trading/account"),
    getPositions: () => get<PaperPosition[]>("/trading/positions"),
    closePosition: (symbol: string, body?: { qty?: string; percentage?: string }) =>
      fetch(`${BASE}/trading/positions/${encodeURIComponent(symbol)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      }).then((r) => r.json()),
    closeAllPositions: () =>
      fetch(`${BASE}/trading/positions`, { method: "DELETE" }).then((r) => r.json()),
    submitOrder: (order: OrderRequest) => post<PaperOrder>("/trading/orders", order),
    getOrders: (status?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      return get<PaperOrder[]>(`/trading/orders${qs ? `?${qs}` : ""}`);
    },
    cancelOrder: (id: string) =>
      fetch(`${BASE}/trading/orders/${id}`, { method: "DELETE" }).then((r) => r.json()),
    cancelAllOrders: () =>
      fetch(`${BASE}/trading/orders`, { method: "DELETE" }).then((r) => r.json()),
    getPortfolioHistory: (period?: string, timeframe?: string) => {
      const params = new URLSearchParams();
      if (period) params.set("period", period);
      if (timeframe) params.set("timeframe", timeframe);
      const qs = params.toString();
      return get<PortfolioHistory>(`/trading/portfolio-history${qs ? `?${qs}` : ""}`);
    },
    getActivities: (limit?: number) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      return get<PaperActivity[]>(`/trading/activities?${params.toString()}`);
    },
    sync: () => post<PaperTradingState>("/trading/sync", {}),
  },
  // ── Advanced Backtesting API ──
  backtest: {
    walkForward: (body: {
      strategy_id: string;
      start_date: string;
      end_date: string;
      train_window_days: number;
      test_window_days: number;
      initial_capital?: number;
    }) => post<WalkForwardResponse>("/backtest/walk-forward", body),
    batch: (body: {
      strategy_ids: string[];
      start_date: string;
      end_date: string;
      initial_capital?: number;
    }) => post<BatchBacktestResponse>("/backtest/batch", body),
    optimize: (body: {
      strategy_id: string;
      start_date: string;
      end_date: string;
      param_grid: Record<string, unknown[]>;
      optimize_metric?: string;
    }) => post<ParamOptimizeResponse>("/backtest/optimize", body),
  },
};

// ── Paper Trading Types ──

export interface PaperAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
}

export interface PaperPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
  avg_entry_price: string;
}

export interface PaperOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  symbol: string;
  qty: string | null;
  notional: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  order_type: string;
  side: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  status: string;
}

export interface OrderRequest {
  symbol: string;
  qty?: string;
  notional?: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
  time_in_force: "day" | "gtc" | "ioc" | "fok";
  limit_price?: string;
  stop_price?: string;
  trail_percent?: string;
  extended_hours?: boolean;
}

export interface PortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
}

export interface PaperActivity {
  id: string;
  activity_type: string;
  symbol?: string;
  side?: string;
  qty?: string;
  price?: string;
  transaction_time?: string;
}

export interface PaperTradingState {
  connected: boolean;
  account: PaperAccount | null;
  positions: PaperPosition[];
  open_orders: PaperOrder[];
  last_sync: string | null;
}

export interface WalkForwardResponse {
  windows: { window_index: number; train_start: string; train_end: string; test_start: string; test_end: string; run_id: string }[];
  total_runs: number;
  message: string;
}

export interface BatchBacktestResponse {
  runs: { strategy_id: string; run_id: string; status: string }[];
  total: number;
}

export interface ParamOptimizeResponse {
  runs: { run_id: string; parameters: Record<string, unknown> }[];
  total_combinations: number;
  optimize_metric: string;
  message: string;
}

export interface MarketDataStatus {
  configured: boolean;
  symbols: Array<{
    symbol: string;
    timeframe: string;
    bar_count: number;
    earliest: string | null;
    latest: string | null;
  }>;
}
