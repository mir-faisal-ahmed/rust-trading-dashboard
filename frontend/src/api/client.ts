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
    list: async (): Promise<Strategy[]> => {
      const raw = await get<unknown[]>("/strategies");
      return raw.map(mapStrategy);
    },
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
    status: () => get<unknown>("/market-data/status"),
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
};
