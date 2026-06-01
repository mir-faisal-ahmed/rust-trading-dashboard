# StratBench — Strategy Development Guide

Use this document as a reference to generate new trading strategies that are compatible with the StratBench application. Each strategy is a Rust module that implements the `TradingStrategy` trait and is registered at startup.

---

## Architecture Overview

- **Backend**: Rust (actix-web, sqlx, tokio)
- **Data**: Alpaca Markets API → stored in PostgreSQL `market_bars` table (OHLCV, daily)
- **Execution**: Walk-forward backtesting over historical bars; strategies receive bars grouped by symbol
- **Output**: Trades + equity curve → stored in DB, metrics computed automatically

---

## Core Types

```rust
/// Single OHLCV bar as loaded from market_bars.
pub struct Bar {
    pub ts: chrono::DateTime<chrono::Utc>,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// Runtime configuration passed to each benchmark execution.
pub struct RunConfig {
    pub run_id: Uuid,
    pub strategy_id: Uuid,
    pub initial_capital: f64,
    pub commission_bps: f64,
    pub slippage_bps: f64,
}

/// A single completed round-trip trade.
pub struct RawTrade {
    pub symbol: String,
    pub side: String,         // "long" or "short"
    pub entry_price: f64,
    pub exit_price: f64,
    pub quantity: f64,
    pub entry_time: chrono::DateTime<chrono::Utc>,
    pub exit_time: chrono::DateTime<chrono::Utc>,
    pub pnl: f64,
    pub pnl_pct: f64,
    pub fees: f64,
    pub slippage: f64,
}

/// Output produced by a strategy run.
pub struct StrategyResult {
    pub trades: Vec<RawTrade>,
    /// (timestamp, total_portfolio_equity) — one entry per trading bar.
    pub equity_curve: Vec<(chrono::DateTime<chrono::Utc>, f64)>,
}
```

---

## The TradingStrategy Trait

```rust
/// Compile-time metadata describing a strategy implementation.
pub struct StrategyMeta {
    /// Stable code identifier — never changes after the strategy ships.
    pub code_key: &'static str,
    /// Human-readable name shown in the UI.
    pub name: &'static str,
    /// Category: "momentum", "mean_reversion", "pairs_trading", "stat_arb",
    ///           "ml_classifier", "lstm_forecast", "transformer",
    ///           "reinforcement_learning", "market_making", "trend_following"
    pub strategy_type: &'static str,
    /// Asset class: "equity", "crypto", "futures", "options", "forex"
    pub asset_class: &'static str,
    pub description: &'static str,
    /// Default JSON parameters (must include "symbols" array).
    pub default_parameters: serde_json::Value,
}

/// Every compiled strategy must implement this trait.
pub trait TradingStrategy: Send + Sync {
    fn meta(&self) -> StrategyMeta;

    /// Execute the strategy against historical bars.
    /// `bars_by_symbol` maps symbol → ASC-sorted bars for the run period.
    fn run(
        &self,
        bars_by_symbol: &std::collections::HashMap<String, Vec<Bar>>,
        params: &serde_json::Value,
        config: &RunConfig,
    ) -> Result<StrategyResult, String>;
}
```

---

## Available Indicators (`strategies/indicators.rs`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `sma` | `(values: &[f64], period: usize) -> Vec<f64>` | Simple Moving Average |
| `ema` | `(values: &[f64], period: usize) -> Vec<f64>` | Exponential Moving Average |
| `rsi` | `(closes: &[f64], period: usize) -> Vec<f64>` | Wilder RSI [0, 100] |
| `macd` | `(closes: &[f64], fast: usize, slow: usize, signal: usize) -> (Vec<f64>, Vec<f64>, Vec<f64>)` | MACD line, signal, histogram |
| `bollinger_bands` | `(closes: &[f64], period: usize, std_dev: f64) -> (Vec<f64>, Vec<f64>, Vec<f64>, Vec<f64>)` | Upper, middle, lower, %B |
| `atr` | `(highs: &[f64], lows: &[f64], closes: &[f64], period: usize) -> Vec<f64>` | Average True Range |

All indicators return `Vec<f64>` with `NaN` for warmup bars (same length as input).

---

## Step-by-Step: Creating a New Strategy

### 1. Create the strategy file

Create `backend/src/strategies/my_strategy.rs`:

```rust
use std::collections::HashMap;
use super::{indicators, Bar, RawTrade, RunConfig, StrategyMeta, StrategyResult, TradingStrategy};

pub struct MyStrategy;

impl MyStrategy {
    pub fn new() -> Self {
        Self
    }
}

impl TradingStrategy for MyStrategy {
    fn meta(&self) -> StrategyMeta {
        StrategyMeta {
            code_key: "my_strategy_v1",
            name: "My Strategy v1",
            strategy_type: "momentum",       // see allowed values above
            asset_class: "equity",           // see allowed values above
            description: "Brief description of what this strategy does",
            default_parameters: serde_json::json!({
                "symbols": ["AAPL", "MSFT", "SPY"],  // REQUIRED: symbols array
                "param1": 14,
                "param2": 0.02
            }),
        }
    }

    fn run(
        &self,
        bars_by_symbol: &HashMap<String, Vec<Bar>>,
        params: &serde_json::Value,
        config: &RunConfig,
    ) -> Result<StrategyResult, String> {
        // 1. Parse parameters from JSON
        let symbols: Vec<String> = params["symbols"]
            .as_array()
            .ok_or("params.symbols must be an array")?
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        // 2. Filter to symbols with enough data
        let tradeable: Vec<&str> = symbols
            .iter()
            .filter_map(|s| {
                let bars = bars_by_symbol.get(s.as_str())?;
                if bars.len() >= 100 { Some(s.as_str()) } else { None }
            })
            .collect();

        if tradeable.is_empty() {
            return Err("no market data found for requested symbols".to_string());
        }

        // 3. Allocate capital equally across symbols
        let capital_per = config.initial_capital / tradeable.len() as f64;
        let comm = config.commission_bps / 10_000.0;
        let slip = config.slippage_bps / 10_000.0;

        let mut all_trades: Vec<RawTrade> = Vec::new();
        let mut equity_map: HashMap<i64, f64> = HashMap::new();

        // 4. Run strategy per symbol
        for sym in &tradeable {
            let bars = &bars_by_symbol[*sym];
            let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();

            // Compute indicators
            let _rsi = indicators::rsi(&closes, 14);
            let _sma = indicators::sma(&closes, 20);

            // YOUR TRADING LOGIC HERE
            // - Track position state (entry price, quantity, entry bar index)
            // - Generate entry/exit signals
            // - Record trades as RawTrade
            // - Track equity per bar

            // Example: track equity (mark-to-market)
            let mut cash = capital_per;
            for bar in bars {
                // equity_map accumulates across all symbols
                *equity_map.entry(bar.ts.timestamp()).or_insert(0.0) += cash;
            }
        }

        // 5. Build equity curve sorted by timestamp
        let mut ts_sorted: Vec<i64> = equity_map.keys().copied().collect();
        ts_sorted.sort_unstable();
        let equity_curve: Vec<(chrono::DateTime<chrono::Utc>, f64)> = ts_sorted
            .into_iter()
            .map(|ts| {
                let dt = chrono::DateTime::from_timestamp(ts, 0).unwrap_or_default();
                (dt, equity_map[&ts])
            })
            .collect();

        Ok(StrategyResult {
            trades: all_trades,
            equity_curve,
        })
    }
}
```

### 2. Register the module

In `backend/src/strategies/mod.rs`, add:
```rust
pub mod my_strategy;
```

### 3. Register in the registry

In `backend/src/strategies/registry.rs`, add to the `all()` function:
```rust
use super::my_strategy::MyStrategy;

pub fn all() -> Vec<Box<dyn TradingStrategy>> {
    vec![
        Box::new(XGBoostClassifier::new()),
        Box::new(MyStrategy::new()),
    ]
}
```

### 4. Build and run

```bash
cd backend
cargo build
cargo run
```

The strategy will be automatically registered in the database at startup via `register_all()`.

---

## Parameter Conventions

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `symbols` | `string[]` | **Yes** | Symbols to trade. Must be valid Alpaca tickers (e.g. "AAPL", "BTC/USD") |
| Any numeric | `number` | No | Strategy-specific parameters (periods, thresholds, etc.) |

The executor auto-fetches market data from Alpaca for all symbols in the `symbols` array before running the strategy. No manual data loading needed.

---

## Trading Logic Guidelines

1. **Commission & slippage**: Apply `config.commission_bps` and `config.slippage_bps` to entries/exits
2. **Force-close**: Close any open position at the last bar of the data
3. **Equity tracking**: Track mark-to-market equity for every bar (cash + position value)
4. **Error on no data**: Return `Err(...)` if no symbols have sufficient data
5. **Min lookback**: Ensure your indicators have enough warmup bars before trading
6. **Side field**: Use `"long"` or `"short"` in `RawTrade.side`
7. **PnL calculation**: `pnl = (exit - entry) * qty - fees` for longs

---

## Critical Rules (Common Mistakes to Avoid)

These rules are **mandatory**. Violating them produces broken metrics (null values, -billions Sharpe, 0% returns despite trading).

### 1. `pnl_pct` must be a DECIMAL RATIO, not a percentage

```rust
// CORRECT:
let pnl_pct = exit / entry - 1.0;  // e.g. 0.05 for a 5% gain

// WRONG — this will break all metrics:
let pnl_pct = (exit / entry - 1.0) * 100.0;  // DO NOT multiply by 100
```

The metrics engine expects `pnl_pct` as a ratio. Multiplying by 100 produces absurd Sharpe/Sortino values.

### 2. Equity curve MUST cover ALL bars, including warmup

Every bar in the dataset must have a corresponding equity entry. During warmup (before trading starts), equity = initial cash.

```rust
// CORRECT pattern: pre-fill equity for all bars
let mut equity_per_bar: Vec<f64> = vec![capital; bars.len()];

for i in 0..bars.len() {
    if i < WARMUP {
        equity_per_bar[i] = cash + inventory * bars[i].close;
        continue;
    }
    // ... trading logic ...
    equity_per_bar[i] = cash + inventory * bars[i].close;
}

// WRONG — skipping early bars creates gaps that break metrics:
for i in warmup..bars.len() {  // starts at warmup, missing bars 0..warmup
    equity_map.entry(bars[i].ts.timestamp()).or_insert(0.0) += equity;
}
```

### 3. Trading conditions must actually trigger

If your buy/sell conditions are too tight, the strategy produces 0 trades. Zero trades means:
- Win rate = 0%, profit factor = null, Sharpe = -infinity
- The equity curve is flat (no alpha demonstrated)

**Test your conditions**: For daily equity bars, a spread of 5 bps (0.05%) almost never gets crossed in a single bar. Use realistic thresholds:
- For daily bars: spreads of 50-200 bps are reasonable entry thresholds
- Compare against previous bar's close to detect crossovers
- Log the number of trades — if 0, your conditions are too restrictive

### 4. Track average entry price correctly for partial fills

If your strategy accumulates a position across multiple buys, you MUST track a weighted-average entry price:

```rust
// CORRECT — weighted average cost basis:
let old_value = avg_entry_price * existing_qty;
existing_qty += new_qty;
avg_entry_price = (old_value + new_entry_price * new_qty) / existing_qty;

// WRONG — using last buy price as "the" entry:
let entry = bars[last_buy_idx].close;  // loses information from earlier buys
```

### 5. Force-close MUST record a trade

If you force-close a position at the end of the data, that trade must be pushed to the trades vector. Otherwise, PnL from the final position is invisible to the metrics engine.

```rust
// At end of data:
if inventory_qty > 0.0 {
    let exit = bars.last().unwrap().close * (1.0 - slip);
    let fee = exit * inventory_qty * comm;
    let pnl = (exit - avg_entry) * inventory_qty - fee;
    let pnl_pct = exit / avg_entry - 1.0;  // RATIO, not percentage
    cash += exit * inventory_qty - fee;
    
    trades.push(RawTrade { /* ... */ });  // DO NOT FORGET THIS
    
    equity_per_bar[last_idx] = cash;  // update final equity
}
```

### 6. Use the per-symbol runner pattern

Follow the same structure as `xgboost_classifier.rs`: a standalone `run_symbol()` function that returns `(Vec<RawTrade>, Vec<f64>)` — trades and equity-per-bar for one symbol. Then aggregate in the `TradingStrategy::run()` implementation:

```rust
fn run_symbol(
    symbol: &str,
    bars: &[Bar],
    capital: f64,
    /* params */
    commission_bps: f64,
    slippage_bps: f64,
) -> (Vec<RawTrade>, Vec<f64>) {
    let n = bars.len();
    let mut equity_per_bar: Vec<f64> = vec![capital; n];
    let mut cash = capital;
    let mut trades: Vec<RawTrade> = Vec::new();
    // ... trading logic, updating equity_per_bar[i] every iteration ...
    (trades, equity_per_bar)
}
```

Then in `run()`:
```rust
for sym in &tradeable {
    let bars = &bars_by_symbol[*sym];
    let (trades, eq_per_bar) = run_symbol(sym, bars, capital_per, ...);
    all_trades.extend(trades);
    for (bar, &eq) in bars.iter().zip(eq_per_bar.iter()) {
        *equity_map.entry(bar.ts.timestamp()).or_insert(0.0) += eq;
    }
}
```

### 7. Benchmark comparison

The system automatically computes a buy-and-hold benchmark using the same symbols your strategy trades. Your strategy's equity curve is compared against "what if we just bought and held these stocks with equal allocation?" This means:
- Alpha shows whether your signals add value vs passive holding
- The chart always shows both lines for visual comparison
- You do NOT need to compute or return the benchmark — the engine does it

### 8. Asset class — use "equity" for US stocks

If your strategy trades standard US tickers (AAPL, SPY, etc.), set `asset_class: "equity"`. Use `"crypto"` only for symbols with `/` like "BTC/USD". The auto-fetch logic uses this to determine whether to call `fetch_stock_bars` or `fetch_crypto_bars`.

---

## Example: Minimal RSI Mean Reversion

```rust
// Buy when RSI < 30, sell when RSI > 70
let rsi_values = indicators::rsi(&closes, 14);

for i in 14..bars.len() {
    if !rsi_values[i].is_finite() { continue; }

    match position {
        None if rsi_values[i] < 30.0 => {
            // Enter long
            let entry = closes[i] * (1.0 + slip);
            let fee = cash * comm;
            let qty = (cash - fee) / entry;
            cash -= fee + entry * qty;
            position = Some((entry, qty, i));
        }
        Some((ep, qty, ei)) if rsi_values[i] > 70.0 => {
            // Exit
            let exit = closes[i] * (1.0 - slip);
            let fee = exit * qty * comm;
            cash += exit * qty - fee;
            trades.push(RawTrade { /* ... */ });
            position = None;
        }
        _ => {}
    }
}
```

---

## File Structure Reference

```
backend/src/strategies/
├── mod.rs              # Module declarations + trait/type definitions
├── registry.rs         # register_all() + get() lookup
├── indicators.rs       # Technical indicators (SMA, EMA, RSI, MACD, BB, ATR)
├── xgboost_classifier.rs  # Example: ML classifier strategy
└── my_strategy.rs      # Your new strategy goes here
```
