# Benchmarking Tool - Frontend

React component module for backtest execution, results visualization, and performance metrics display.

## Overview

The Benchmarking frontend provides:
- **Benchmark Control**: Queue new backtest runs
- **Results Display**: Equity curves, trades, metrics
- **Performance Charts**: Equity, drawdown, returns over time
- **Metrics Table**: 20+ performance indicators
- **Trade Analysis**: Individual trade listing with P&L

## Component Structure

```
frontend/src/tools/benchmarking/
├── index.ts                 # Public exports
├── BenchmarkTypes.ts        # TypeScript types
├── BenchmarkHooks.ts        # React hooks
├── BenchmarkView.tsx        # Main container
├── BenchmarkResults.tsx     # Results panel
├── PerformanceChart.tsx     # Chart visualization
├── MetricsTable.tsx         # Metrics display
├── TradesList.tsx           # Trade listing
├── README.md                # This file
└── __tests__/               # Jest tests
```

## Usage

```tsx
import { BenchmarkView } from "@/tools/benchmarking";

export function BacktestPage() {
  return <BenchmarkView strategyId="strategy-uuid" />;
}
```

## Features

### Benchmark Control
- Strategy selector
- Start/end date pickers
- Initial capital input
- Commission/slippage settings
- "Run Benchmark" button

### Results Display
- **Equity Curve**: Line chart of portfolio value over time
- **Drawdown Curve**: Rolling drawdown percentage
- **Metrics**: Sharpe, Sortino, max drawdown, etc.
- **Trades**: Individual trade records

### Performance Metrics
- Risk-adjusted returns (Sharpe, Sortino, Calmar)
- Drawdown analysis
- Trade statistics (win rate, profit factor)
- Distribution metrics (skewness, kurtosis)

## Types

```typescript
export interface BenchmarkRun {
  id: string;
  strategy_id: string;
  strategy_name: string;
  start_date: string;
  end_date: string;
  status: "queued" | "running" | "completed" | "failed";
  duration_ms: number;
  metrics: PerformanceMetrics | null;
  equity_curve: EquityPoint[];
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
  volatility_ann_pct: number;
  win_rate_pct: number;
  profit_factor: number;
  // ... 11 more
}
```

## Common Tasks

### Create Benchmark Run
```tsx
const { create } = useBenchmarkCreate();

create({
  strategy_id: strategyId,
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  initial_capital: 100000,
  commission_bps: 10,
  slippage_bps: 5,
});
```

### Display Equity Curve
```tsx
<PerformanceChart
  data={benchmarkRun.equity_curve}
  type="equity"
/>
```

### View Trade Summary
```tsx
<TradesList
  trades={benchmarkRun.trades}
  showStats={true}
/>
```

## Testing

```bash
npm test -- --testPathPattern=benchmarking
```

## Integration

Works with:
- **Strategies Tool**: Select strategy to benchmark
- **Tuning Tool**: Run benchmark with tuned parameters
- **Paper Trading Tool**: Replay trades in simulator

