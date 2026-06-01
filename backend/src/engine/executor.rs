use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, NaiveDate, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use super::{metrics, EngineState};
use crate::data::alpaca::{self, AlpacaClient};
use crate::db::models::PerformanceMetrics;
use crate::strategies::{self, Bar, RunConfig};

fn extract_symbols(parameters: &serde_json::Value) -> Vec<String> {
    let mut symbols: Vec<String> = Vec::new();

    let mut extend_from_array = |key: &str| {
        if let Some(arr) = parameters.get(key).and_then(|v| v.as_array()) {
            for value in arr {
                if let Some(sym) = value.as_str() {
                    let s = sym.trim().to_uppercase();
                    if !s.is_empty() {
                        symbols.push(s);
                    }
                }
            }
        }
    };

    extend_from_array("symbols");
    extend_from_array("risk_on_symbols");
    extend_from_array("defensive_symbols");

    if let Some(cash_sym) = parameters.get("cash_symbol").and_then(|v| v.as_str()) {
        let s = cash_sym.trim().to_uppercase();
        if !s.is_empty() {
            symbols.push(s);
        }
    }

    symbols.sort();
    symbols.dedup();
    symbols
}

// ────────────────────────────────────────────────────────────────────────────
// DB row for market bars (used internally by executor only).
// ────────────────────────────────────────────────────────────────────────────
#[derive(sqlx::FromRow)]
struct DbBar {
    ts: DateTime<Utc>,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    volume: f64,
}

impl From<DbBar> for Bar {
    fn from(b: DbBar) -> Self {
        Bar {
            ts: b.ts,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
        }
    }
}

/// Fetch daily bars for a symbol over a date range.
async fn fetch_bars(
    pool: &PgPool,
    symbol: &str,
    start: NaiveDate,
    end: NaiveDate,
) -> Result<Vec<Bar>, sqlx::Error> {
    let rows = sqlx::query_as::<_, DbBar>(
        r#"
        SELECT ts,
               open::float8  AS open,
               high::float8  AS high,
               low::float8   AS low,
               close::float8 AS close,
               volume::float8 AS volume
        FROM   market_bars
        WHERE  symbol    = $1
          AND  timeframe = '1Day'
          AND  ts::date >= $2
          AND  ts::date <= $3
        ORDER  BY ts ASC
        "#,
    )
    .bind(symbol)
    .bind(start)
    .bind(end)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Bar::from).collect())
}

// ────────────────────────────────────────────────────────────────────────────
// Compute all PerformanceMetrics from strategy output.
// ────────────────────────────────────────────────────────────────────────────

fn build_metrics(
    run_id: Uuid,
    initial_capital: f64,
    equity_curve: &[(DateTime<Utc>, f64)],
    trades: &[crate::strategies::RawTrade],
    bench_equity_curve: &[(DateTime<Utc>, f64)],
) -> PerformanceMetrics {
    // Clamp non-finite values so they don't corrupt the DB or UI.
    let sanitize = |v: f64| if v.is_finite() { v } else { 0.0 };
    let equities: Vec<f64> = equity_curve.iter().map(|(_, e)| *e).collect();
    let daily_returns: Vec<f64> = equities
        .windows(2)
        .map(|w| if w[0] > 0.0 { w[1] / w[0] - 1.0 } else { 0.0 })
        .collect();

    let bench_equities: Vec<f64> = bench_equity_curve.iter().map(|(_, e)| *e).collect();
    let bench_returns: Vec<f64> = bench_equities
        .windows(2)
        .map(|w| if w[0] > 0.0 { w[1] / w[0] - 1.0 } else { 0.0 })
        .collect();

    let final_equity = equities.last().copied().unwrap_or(initial_capital);
    let total_return = (final_equity - initial_capital) / initial_capital * 100.0;
    let n_days = daily_returns.len() as f64;
    let ann_factor = if n_days > 0.0 { 252.0 / n_days } else { 1.0 };
    let ann_return = ((final_equity / initial_capital).powf(ann_factor) - 1.0) * 100.0;

    let (max_dd, max_dd_days) = metrics::max_drawdown(&equities);
    let sharpe = metrics::sharpe_ratio(&daily_returns, 0.05);
    let sortino = metrics::sortino_ratio(&daily_returns, 0.05);
    let vol_ann = metrics::annualized_volatility(&daily_returns) * 100.0;
    let calmar = if max_dd != 0.0 { ann_return / max_dd.abs() } else { 0.0 };

    let pnls: Vec<f64> = trades.iter().map(|t| t.pnl).collect();
    let pnl_pcts: Vec<f64> = trades.iter().map(|t| t.pnl_pct * 100.0).collect();
    let win_rate = metrics::win_rate(&pnls) * 100.0;
    let pf = metrics::profit_factor(&pnls);
    let total_trades = trades.len() as i32;

    let avg_trade = if !pnl_pcts.is_empty() {
        pnl_pcts.iter().sum::<f64>() / pnl_pcts.len() as f64
    } else {
        0.0
    };
    let wins: Vec<f64> = pnl_pcts.iter().copied().filter(|&p| p > 0.0).collect();
    let losses: Vec<f64> = pnl_pcts.iter().copied().filter(|&p| p < 0.0).collect();
    let avg_win = if !wins.is_empty() { wins.iter().sum::<f64>() / wins.len() as f64 } else { 0.0 };
    let avg_loss = if !losses.is_empty() { losses.iter().sum::<f64>() / losses.len() as f64 } else { 0.0 };
    let win_r = win_rate / 100.0;
    let expectancy = win_r * avg_win + (1.0 - win_r) * avg_loss;

    let avg_hold_hrs = if !trades.is_empty() {
        trades
            .iter()
            .map(|t| (t.exit_time - t.entry_time).num_minutes() as f64 / 60.0)
            .sum::<f64>()
            / trades.len() as f64
    } else {
        0.0
    };

    let skew = metrics::skewness(&daily_returns);
    let kurt = metrics::kurtosis(&daily_returns);
    let var95 = metrics::value_at_risk(&daily_returns, 0.95) * 100.0;
    let cvar95 = metrics::conditional_var(&daily_returns, 0.95) * 100.0;

    let (beta, alpha_ann) = metrics::beta_and_alpha(&daily_returns, &bench_returns, 0.05);
    let ir = metrics::information_ratio(&daily_returns, &bench_returns);
    let treynor = if beta != 0.0 {
        (ann_return / 100.0 - 0.05) / beta * 100.0
    } else {
        0.0
    };
    let omega = metrics::omega_ratio(&daily_returns, 0.0);
    let tail = metrics::tail_ratio(&daily_returns);

    PerformanceMetrics {
        id: Uuid::new_v4(),
        benchmark_run_id: run_id,
        total_return_pct: sanitize(total_return),
        annualized_return_pct: sanitize(ann_return),
        sharpe_ratio: sanitize(sharpe),
        sortino_ratio: sanitize(sortino),
        calmar_ratio: sanitize(calmar),
        max_drawdown_pct: sanitize(max_dd * 100.0),
        max_drawdown_duration_days: max_dd_days as i32,
        volatility_ann_pct: sanitize(vol_ann),
        win_rate_pct: sanitize(win_rate),
        profit_factor: sanitize(pf),
        total_trades,
        avg_trade_return_pct: sanitize(avg_trade),
        avg_win_pct: sanitize(avg_win),
        avg_loss_pct: sanitize(avg_loss),
        expectancy: sanitize(expectancy),
        avg_holding_period_hours: sanitize(avg_hold_hrs),
        skewness: sanitize(skew),
        kurtosis: sanitize(kurt),
        var_95_pct: sanitize(var95),
        cvar_95_pct: sanitize(cvar95),
        beta: sanitize(beta),
        alpha_ann_pct: sanitize(alpha_ann),
        information_ratio: sanitize(ir),
        treynor_ratio: sanitize(treynor),
        omega_ratio: sanitize(omega),
        tail_ratio: sanitize(tail),
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Main executor entry point
// ────────────────────────────────────────────────────────────────────────────

pub async fn execute_benchmark(pool: PgPool, engine: Arc<EngineState>, run_id: Uuid, alpaca: AlpacaClient) {
    tracing::info!("starting benchmark execution for run {}", run_id);

    if let Err(e) = sqlx::query(
        "UPDATE benchmark_runs SET status = 'running' WHERE id = $1",
    )
    .bind(run_id)
    .execute(&pool)
    .await
    {
        tracing::error!("failed to mark run as running: {}", e);
        engine.complete_run(run_id);
        return;
    }

    let result = run_inner(&pool, run_id, &alpaca).await;

    match result {
        Ok(()) => {
            tracing::info!("benchmark run {} completed successfully", run_id);
        }
        Err(ref e) => {
            tracing::error!("benchmark run {} failed: {}", run_id, e);
            let _ = sqlx::query(
                "UPDATE benchmark_runs SET status = 'failed', completed_at = NOW() WHERE id = $1",
            )
            .bind(run_id)
            .execute(&pool)
            .await;
        }
    }

    engine.complete_run(run_id);
}

async fn run_inner(pool: &PgPool, run_id: Uuid, alpaca: &AlpacaClient) -> Result<(), String> {
    let start_time = std::time::Instant::now();

    // ── Load run + strategy ───────────────────────────────────────────────
    let run = sqlx::query_as::<_, crate::db::models::BenchmarkRun>(
        "SELECT * FROM benchmark_runs WHERE id = $1",
    )
    .bind(run_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("run {} not found", run_id))?;

    let strategy = sqlx::query_as::<_, crate::db::models::Strategy>(
        "SELECT * FROM strategies WHERE id = $1 AND is_active = TRUE",
    )
    .bind(run.strategy_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("strategy {} not found", run.strategy_id))?;

    let code_key = strategy
        .code_key
        .as_deref()
        .ok_or_else(|| format!("strategy '{}' has no code_key", strategy.name))?;

    let impl_ = strategies::registry::get(code_key)
        .ok_or_else(|| format!("no implementation registered for code_key '{}'", code_key))?;

    tracing::info!(
        "running '{}' ({}) from {} to {}",
        strategy.name,
        code_key,
        run.start_date,
        run.end_date
    );

    // ── Extract symbols early (needed for both auto-fetch and execution) ─
    let symbols = extract_symbols(&strategy.parameters);
    if symbols.is_empty() {
        return Err("strategy has no symbols configured".to_string());
    }

    // ── Auto-fetch bars from Alpaca if not already in DB ───────────────
    if alpaca.is_configured() {
        let start_str = run.start_date.format("%Y-%m-%d").to_string();
        let end_str = run.end_date.format("%Y-%m-%d").to_string();

        // Ensure SPY is fetched for benchmark comparison
        let mut all_symbols = symbols.clone();
        if !all_symbols.contains(&"SPY".to_string()) {
            all_symbols.push("SPY".to_string());
        }

        for sym in &all_symbols {
            let count: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM market_bars WHERE symbol=$1 AND timeframe='1Day' AND ts::date >= $2 AND ts::date <= $3",
            )
            .bind(sym.as_str())
            .bind(run.start_date)
            .bind(run.end_date)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

            if count.0 < 10 {
                tracing::info!("auto-fetching market data for {} ({} to {})", sym, start_str, end_str);
                let is_crypto = sym.contains('/');
                let fetched_bars = if is_crypto {
                    alpaca.fetch_crypto_bars(sym, "1Day", &start_str, &end_str).await
                } else {
                    alpaca.fetch_stock_bars(sym, "1Day", &start_str, &end_str).await
                };
                match fetched_bars {
                    Ok(raw_bars) => {
                        let inserted = alpaca::store_bars(pool, sym, "1Day", &raw_bars)
                            .await
                            .map_err(|e| e.to_string())?;
                        tracing::info!("auto-fetched {} bars for {} (inserted {})", raw_bars.len(), sym, inserted);
                    }
                    Err(e) => {
                        tracing::warn!("failed to auto-fetch data for {}: {}", sym, e);
                    }
                }
            }
        }
    }

    // ── Fetch bars ────────────────────────────────────────────────────────
    // Load 300-bar lookback so indicator-heavy strategies (XGBoost, FinRL)
    // have enough history for warm-up. Bars before start_date are included
    // in the bar series but equity curve recording begins at start_date.
    let lookback_start = {
        use chrono::Duration;
        // 300 trading days ≈ 420 calendar days
        run.start_date - Duration::days(420)
    };
    let mut bars_by_symbol: HashMap<String, Vec<Bar>> = HashMap::new();
    for sym in &symbols {
        let bars = fetch_bars(pool, sym, lookback_start, run.end_date)
            .await
            .map_err(|e| e.to_string())?;
        if !bars.is_empty() {
            bars_by_symbol.insert(sym.clone(), bars);
        }
    }

    // ── Execute strategy ──────────────────────────────────────────────────
    let config = RunConfig {
        run_id,
        strategy_id: run.strategy_id,
        initial_capital: run.initial_capital,
        commission_bps: run.commission_bps,
        slippage_bps: run.slippage_bps,
    };

    let result = impl_
        .run(&bars_by_symbol, &strategy.parameters, &config)
        .map_err(|e| e)?;

    tracing::info!(
        "strategy produced {} trades and {} equity points",
        result.trades.len(),
        result.equity_curve.len()
    );

    // ── Build buy-and-hold benchmark from actual traded symbols ─────────
    // Equal-weight buy-and-hold: split capital across traded symbols.
    // Anchor the first price to run.start_date so benchmark equity = initial_capital at day 0.
    let traded_symbols: Vec<&str> = bars_by_symbol.keys().map(|s| s.as_str()).collect();
    let n_traded = traded_symbols.len().max(1) as f64;
    let capital_per_sym = run.initial_capital / n_traded;

    // For each traded symbol, use the first bar on or after run.start_date as the reference price
    let first_prices: HashMap<&str, f64> = traded_symbols
        .iter()
        .filter_map(|&sym| {
            bars_by_symbol
                .get(sym)
                .and_then(|bars| {
                    bars.iter()
                        .find(|b| b.ts.date_naive() >= run.start_date)
                        .map(|b| (sym, b.close))
                })
        })
        .collect();

    // Aggregate buy-and-hold equity by timestamp across all symbols
    let mut bench_map: HashMap<i64, f64> = HashMap::new();
    for &sym in &traded_symbols {
        let bars = match bars_by_symbol.get(sym) {
            Some(b) => b,
            None => continue,
        };
        let first_price = match first_prices.get(sym) {
            Some(&p) if p > 0.0 => p,
            _ => continue,
        };
        for bar in bars {
            // Only include bars within the benchmark window
            if bar.ts.date_naive() < run.start_date {
                continue;
            }
            let bh_equity = capital_per_sym * (bar.close / first_price);
            *bench_map.entry(bar.ts.timestamp()).or_insert(0.0) += bh_equity;
        }
    }

    let mut bench_ts_sorted: Vec<i64> = bench_map.keys().copied().collect();
    bench_ts_sorted.sort_unstable();
    let bench_equity_curve: Vec<(DateTime<Utc>, f64)> = bench_ts_sorted
        .iter()
        .map(|&ts| {
            let dt = DateTime::from_timestamp(ts, 0).unwrap_or_default();
            (dt, bench_map[&ts])
        })
        .collect();

    // Build a fast lookup from date → bench equity for snapshot persistence
    let bench_by_date: HashMap<NaiveDate, f64> = bench_equity_curve
        .iter()
        .map(|(dt, eq)| (dt.date_naive(), *eq))
        .collect();

    // Build a fast lookup from date → predicted equity for FinRL strategies
    let pred_by_date: HashMap<NaiveDate, f64> = result.predicted_equity
        .as_ref()
        .map(|curve| {
            curve.iter()
                .map(|(dt, eq)| (dt.date_naive(), *eq))
                .collect()
        })
        .unwrap_or_default();

    let mut peak_equity = run.initial_capital;
    for (ts, equity) in &result.equity_curve {
        // Skip lookback bars -- only persist snapshots within the benchmark window
        if ts.date_naive() < run.start_date {
            continue;
        }
        if *equity > peak_equity {
            peak_equity = *equity;
        }
        let drawdown_pct = if peak_equity > 0.0 {
            (*equity - peak_equity) / peak_equity * 100.0
        } else {
            0.0
        };
        let bench_eq = bench_by_date
            .get(&ts.date_naive())
            .copied()
            .unwrap_or(run.initial_capital);
        let pred_eq: Option<f64> = pred_by_date.get(&ts.date_naive()).copied();

        sqlx::query(
            r#"
            INSERT INTO equity_snapshots
                (id, benchmark_run_id, timestamp, equity, benchmark_equity, drawdown_pct, predicted_equity)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(run_id)
        .bind(*ts)
        .bind(*equity)
        .bind(bench_eq)
        .bind(drawdown_pct)
        .bind(pred_eq)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ── Persist trades ────────────────────────────────────────────────────
    for t in &result.trades {
        sqlx::query(
            r#"
            INSERT INTO trades
                (id, benchmark_run_id, strategy_id, symbol, side,
                 entry_price, exit_price, quantity,
                 entry_time, exit_time, pnl, pnl_pct, fees, slippage)
            VALUES
                (gen_random_uuid(), $1, $2, $3, $4,
                 $5, $6, $7,
                 $8, $9, $10, $11, $12, $13)
            "#,
        )
        .bind(run_id)
        .bind(run.strategy_id)
        .bind(&t.symbol)
        .bind(&t.side)
        .bind(t.entry_price)
        .bind(t.exit_price)
        .bind(t.quantity)
        .bind(t.entry_time)
        .bind(t.exit_time)
        .bind(t.pnl)
        .bind(t.pnl_pct)
        .bind(t.fees)
        .bind(t.slippage)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ── Compute and persist metrics ───────────────────────────────────────
    // Filter equity curve to only the benchmark window for metric calculations
    let windowed_curve: Vec<(DateTime<Utc>, f64)> = result.equity_curve
        .iter()
        .filter(|(ts, _)| ts.date_naive() >= run.start_date)
        .copied()
        .collect();

    if !windowed_curve.is_empty() {
        let m = build_metrics(
            run_id,
            run.initial_capital,
            &windowed_curve,
            &result.trades,
            &bench_equity_curve,
        );
        sqlx::query(
            r#"
            INSERT INTO performance_metrics (
                id, benchmark_run_id,
                total_return_pct, annualized_return_pct, sharpe_ratio, sortino_ratio,
                calmar_ratio, max_drawdown_pct, max_drawdown_duration_days, volatility_ann_pct,
                win_rate_pct, profit_factor, total_trades, avg_trade_return_pct,
                avg_win_pct, avg_loss_pct, expectancy, avg_holding_period_hours,
                skewness, kurtosis, var_95_pct, cvar_95_pct,
                beta, alpha_ann_pct, information_ratio, treynor_ratio,
                omega_ratio, tail_ratio
            ) VALUES (
                $1, $2,
                $3, $4, $5, $6,
                $7, $8, $9, $10,
                $11, $12, $13, $14,
                $15, $16, $17, $18,
                $19, $20, $21, $22,
                $23, $24, $25, $26,
                $27, $28
            )
            "#,
        )
        .bind(m.id)
        .bind(m.benchmark_run_id)
        .bind(m.total_return_pct)
        .bind(m.annualized_return_pct)
        .bind(m.sharpe_ratio)
        .bind(m.sortino_ratio)
        .bind(m.calmar_ratio)
        .bind(m.max_drawdown_pct)
        .bind(m.max_drawdown_duration_days)
        .bind(m.volatility_ann_pct)
        .bind(m.win_rate_pct)
        .bind(m.profit_factor)
        .bind(m.total_trades)
        .bind(m.avg_trade_return_pct)
        .bind(m.avg_win_pct)
        .bind(m.avg_loss_pct)
        .bind(m.expectancy)
        .bind(m.avg_holding_period_hours)
        .bind(m.skewness)
        .bind(m.kurtosis)
        .bind(m.var_95_pct)
        .bind(m.cvar_95_pct)
        .bind(m.beta)
        .bind(m.alpha_ann_pct)
        .bind(m.information_ratio)
        .bind(m.treynor_ratio)
        .bind(m.omega_ratio)
        .bind(m.tail_ratio)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ── Finalise run ──────────────────────────────────────────────────────
    let duration_ms = start_time.elapsed().as_millis() as i64;
    sqlx::query(
        "UPDATE benchmark_runs SET status = 'completed', duration_ms = $2, completed_at = NOW() WHERE id = $1",
    )
    .bind(run_id)
    .bind(duration_ms)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE strategies SET status = 'idle', updated_at = NOW() WHERE id = $1",
    )
    .bind(run.strategy_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    tracing::info!("run {} completed in {}ms", run_id, duration_ms);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::extract_symbols;

    #[test]
    fn test_extract_symbols_from_symbols_array() {
        let params = serde_json::json!({
            "symbols": ["aapl", " msft ", "AAPL"]
        });
        let symbols = extract_symbols(&params);
        assert_eq!(symbols, vec!["AAPL".to_string(), "MSFT".to_string()]);
    }

    #[test]
    fn test_extract_symbols_from_rotation_schema() {
        let params = serde_json::json!({
            "risk_on_symbols": ["qqq", "spy"],
            "defensive_symbols": ["tlt", "ief"],
            "cash_symbol": "shy"
        });
        let symbols = extract_symbols(&params);
        assert_eq!(
            symbols,
            vec![
                "IEF".to_string(),
                "QQQ".to_string(),
                "SHY".to_string(),
                "SPY".to_string(),
                "TLT".to_string(),
            ]
        );
    }

    #[test]
    fn test_extract_symbols_empty_when_schema_missing() {
        let params = serde_json::json!({
            "foo": "bar"
        });
        let symbols = extract_symbols(&params);
        assert!(symbols.is_empty());
    }
}
