use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, NaiveDate, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use super::{metrics, EngineState};
use crate::db::models::PerformanceMetrics;
use crate::strategies::{self, Bar, RunConfig};

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
    spy_bars: &[Bar],
) -> PerformanceMetrics {
    // Daily strategy returns.
    let equities: Vec<f64> = equity_curve.iter().map(|(_, e)| *e).collect();
    let daily_returns: Vec<f64> = equities
        .windows(2)
        .map(|w| if w[0] > 0.0 { w[1] / w[0] - 1.0 } else { 0.0 })
        .collect();

    // Build a date → SPY close map for benchmark returns.
    let spy_map: HashMap<NaiveDate, f64> = spy_bars
        .iter()
        .map(|b| (b.ts.date_naive(), b.close))
        .collect();
    let bench_returns: Vec<f64> = equity_curve
        .windows(2)
        .map(|w| {
            let d0 = w[0].0.date_naive();
            let d1 = w[1].0.date_naive();
            match (spy_map.get(&d0), spy_map.get(&d1)) {
                (Some(&c0), Some(&c1)) if c0 > 0.0 => c1 / c0 - 1.0,
                _ => 0.0,
            }
        })
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
        total_return_pct: total_return,
        annualized_return_pct: ann_return,
        sharpe_ratio: sharpe,
        sortino_ratio: sortino,
        calmar_ratio: calmar,
        max_drawdown_pct: max_dd * 100.0,
        max_drawdown_duration_days: max_dd_days as i32,
        volatility_ann_pct: vol_ann,
        win_rate_pct: win_rate,
        profit_factor: pf,
        total_trades,
        avg_trade_return_pct: avg_trade,
        avg_win_pct: avg_win,
        avg_loss_pct: avg_loss,
        expectancy,
        avg_holding_period_hours: avg_hold_hrs,
        skewness: skew,
        kurtosis: kurt,
        var_95_pct: var95,
        cvar_95_pct: cvar95,
        beta,
        alpha_ann_pct: alpha_ann,
        information_ratio: ir,
        treynor_ratio: treynor,
        omega_ratio: omega,
        tail_ratio: tail,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Main executor entry point
// ────────────────────────────────────────────────────────────────────────────

pub async fn execute_benchmark(pool: PgPool, engine: Arc<EngineState>, run_id: Uuid) {
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

    let result = run_inner(&pool, run_id).await;

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

async fn run_inner(pool: &PgPool, run_id: Uuid) -> Result<(), String> {
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
        "SELECT * FROM strategies WHERE id = $1",
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

    // ── Fetch bars ────────────────────────────────────────────────────────
    let symbols: Vec<String> = strategy.parameters["symbols"]
        .as_array()
        .ok_or("strategy.parameters.symbols is not an array")?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();

    let mut bars_by_symbol: HashMap<String, Vec<Bar>> = HashMap::new();
    for sym in &symbols {
        let bars = fetch_bars(pool, sym, run.start_date, run.end_date)
            .await
            .map_err(|e| e.to_string())?;
        if !bars.is_empty() {
            bars_by_symbol.insert(sym.clone(), bars);
        }
    }

    let spy_bars = fetch_bars(pool, "SPY", run.start_date, run.end_date)
        .await
        .unwrap_or_default();

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

    // ── Persist equity snapshots ──────────────────────────────────────────
    let spy_map: HashMap<NaiveDate, f64> = spy_bars
        .iter()
        .map(|b| (b.ts.date_naive(), b.close))
        .collect();
    let spy_first = spy_bars.first().map(|b| b.close).unwrap_or(1.0);

    let mut peak_equity = run.initial_capital;
    for (ts, equity) in &result.equity_curve {
        if *equity > peak_equity {
            peak_equity = *equity;
        }
        let drawdown_pct = if peak_equity > 0.0 {
            (*equity - peak_equity) / peak_equity * 100.0
        } else {
            0.0
        };
        let spy_close = spy_map
            .get(&ts.date_naive())
            .copied()
            .unwrap_or(spy_first);
        let bench_eq = if spy_first > 0.0 {
            run.initial_capital * (spy_close / spy_first)
        } else {
            run.initial_capital
        };

        sqlx::query(
            r#"
            INSERT INTO equity_snapshots
                (id, benchmark_run_id, timestamp, equity, benchmark_equity, drawdown_pct)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
            "#,
        )
        .bind(run_id)
        .bind(*ts)
        .bind(*equity)
        .bind(bench_eq)
        .bind(drawdown_pct)
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
    if !result.equity_curve.is_empty() {
        let m = build_metrics(
            run_id,
            run.initial_capital,
            &result.equity_curve,
            &result.trades,
            &spy_bars,
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
