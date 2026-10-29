# Benchmarking Tool

Self-contained module for backtest execution and comprehensive performance metrics collection.

## Overview

The Benchmarking Tool executes strategies against historical market data and computes detailed performance analytics. It provides:

- **Execution Engine**: Bar-by-bar strategy execution with trade tracking
- **Metrics**: 20+ performance metrics (Sharpe, Sortino, Calmar, max drawdown, etc.)
- **Results**: Equity curves, drawdown curves, individual trades, performance snapshots
- **Reproducibility**: Date range, capital, commissions, and slippage fully tracked

## Standalone CLI Usage

```bash
# List all benchmark runs
cargo run --bin benchmarking_cli -- list

# Run a benchmark
cargo run --bin benchmarking_cli -- run \
  --strategy-id <uuid> \
  --start 2024-01-01 \
  --end 2024-12-31 \
  --initial-capital 100000

# Show detailed results
cargo run --bin benchmarking_cli -- results --run-id <uuid>

# Export equity curve as CSV
cargo run --bin benchmarking_cli -- export-equity --run-id <uuid> --format csv

# Export trades
cargo run --bin benchmarking_cli -- export-trades --run-id <uuid> --format json

# Compute metrics for a run
cargo run --bin benchmarking_cli -- metrics --run-id <uuid>

# Compare multiple runs
cargo run --bin benchmarking_cli -- compare \
  --run-ids <uuid1>,<uuid2>,<uuid3>
```

## API Integration

All endpoints prefixed with `/api/v1/benchmarks`:

```bash
# GET /benchmarks/full (all runs with full results)
curl http://localhost:8080/api/v1/benchmarks/full

# GET /benchmarks/{id}/full
curl http://localhost:8080/api/v1/benchmarks/550e8400-e29b-41d4-a716-446655440000/full

# POST /benchmarks (create new run)
curl -X POST http://localhost:8080/api/v1/benchmarks \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "550e8400-e29b-41d4-a716-446655440000",
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
    "initial_capital": 100000,
    "commission_bps": 10,
    "slippage_bps": 5
  }'
```

## File Structure

```
backend/src/tools/benchmarking/
├── mod.rs              # Module exports
├── core.rs             # Type definitions
├── service.rs          # BenchmarkService trait
├── executor.rs         # Bar-by-bar execution engine
├── metrics.rs          # Metrics calculation logic
├── cli.rs              # Standalone CLI
├── tests.rs            # Unit & integration tests
└── README.md           # This file
```

## Core Types

```rust
pub struct BenchmarkRun {
    pub id: Uuid,
    pub strategy_id: Uuid,
    pub start_date: chrono::NaiveDate,
    pub end_date: chrono::NaiveDate,
    pub status: String,           // queued, running, completed, failed
    pub duration_ms: Option<i64>,
    pub initial_capital: f64,
    pub commission_bps: f64,
    pub slippage_bps: f64,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

pub struct PerformanceMetrics {
    pub total_return_pct: f64,
    pub annualized_return_pct: f64,
    pub sharpe_ratio: f64,
    pub sortino_ratio: f64,
    pub calmar_ratio: f64,
    pub max_drawdown_pct: f64,
    pub max_drawdown_duration_days: i32,
    pub volatility_ann_pct: f64,
    pub win_rate_pct: f64,
    pub profit_factor: f64,
    // ... and 10+ more
}
```

## Execution Flow

1. **Fetch Bars**: Load historical OHLCV data for specified date range
2. **Initialize**: Create strategy instance with parameters
3. **Execute**: Process each bar, record trades, track equity
4. **Compute Metrics**: Calculate 20+ performance metrics
5. **Store Results**: Save metrics, trades, equity snapshots to DB
6. **Return**: Full results including curves and individual trades

## Performance Metrics

### Risk-Adjusted Returns
- **Sharpe Ratio**: Return per unit volatility (3% risk-free)
- **Sortino Ratio**: Like Sharpe but only penalizes downside volatility
- **Calmar Ratio**: Annual return / max drawdown

### Drawdown
- **Max Drawdown %**: Largest peak-to-trough decline
- **Drawdown Duration**: Days in max drawdown
- **Drawdown Curve**: Rolling drawdown at each bar

### Trade Statistics
- **Total Trades**: Count of completed round-trips
- **Win Rate %**: % of profitable trades
- **Profit Factor**: Gross profit / gross loss
- **Avg Trade Return %**: Mean P&L per trade
- **Expectancy**: Expected return per trade

### Distribution
- **Skewness**: Return distribution asymmetry
- **Kurtosis**: Return distribution tail heaviness
- **VaR 95%**: Value at Risk at 95% confidence
- **CVaR 95%**: Conditional VaR (average of worst 5%)

### Relative Performance
- **Beta**: Correlation with benchmark (SPY)
- **Alpha %**: Excess return vs benchmark
- **Information Ratio**: Alpha / tracking error

## Testing

```bash
# Run all benchmarking tests
cargo test -p stratbench benchmarking

# Test metrics calculation
cargo test -p stratbench benchmarking::metrics::tests

# Test executor logic
cargo test -p stratbench benchmarking::executor::tests

# With output
cargo test -p stratbench benchmarking -- --nocapture
```

## Common Patterns

### Optimize Date Range
For faster iteration during tuning:
```bash
# Quick 6-month test
cargo run --bin benchmarking_cli -- run \
  --strategy-id <uuid> \
  --start 2024-07-01 \
  --end 2024-12-31

# Full year
cargo run --bin benchmarking_cli -- run \
  --strategy-id <uuid> \
  --start 2024-01-01 \
  --end 2024-12-31
```

### Monitor Execution Progress
```bash
# Watch status updates
while true; do
  cargo run --bin benchmarking_cli -- status --run-id <uuid>
  sleep 5
done
```

### Export for Analysis
```bash
# Export equity curve
cargo run --bin benchmarking_cli -- export-equity --run-id <uuid> > equity.csv

# Import into Python/R for further analysis
python3 analyze_equity.py equity.csv
```

## Integration with Other Tools

### Benchmark Using Tuned Parameters
```bash
# 1. Create tuning job
tuning_job=$(cargo run --bin tuning_cli -- create-job ...)

# 2. Run benchmark with parameters from tuning job
cargo run --bin benchmarking_cli -- run \
  --strategy-id <uuid> \
  --from-tuning $tuning_job
```

### Compare Strategy Versions
```bash
# Run v1
run1=$(cargo run --bin benchmarking_cli -- run --strategy-id <v1-uuid>)

# Run v2
run2=$(cargo run --bin benchmarking_cli -- run --strategy-id <v2-uuid>)

# Compare
cargo run --bin benchmarking_cli -- compare --run-ids $run1,$run2
```

## Performance Considerations

- **Data Loading**: Uses streaming where possible; large date ranges may take time
- **Metrics Calculation**: O(n) where n = number of bars; typically < 1ms per bar
- **Storage**: Each run stores ~1KB per bar + trade data; budget ~10MB per year of daily data
- **Concurrency**: Multiple benchmarks can run in parallel (separate processes)

## Debugging

### View Detailed Logs
```bash
RUST_LOG=stratbench=debug cargo run --bin benchmarking_cli -- run ...
```

### Export Intermediate Results
```bash
# Get equity curve for a run
cargo run --bin benchmarking_cli -- export-equity --run-id <uuid> --format json

# Get all trades
cargo run --bin benchmarking_cli -- export-trades --run-id <uuid> --format json

# Analyze in CLI
jq '.[] | select(.pnl > 0)' trades.json | wc -l  # Count winning trades
```

