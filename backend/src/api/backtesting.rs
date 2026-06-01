//! Advanced backtesting capabilities:
//! - Walk-forward analysis (split data into train/test windows)
//! - Multi-run batch backtesting
//! - Parameter sweep / optimization

use actix_web::{web, HttpResponse};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::data::alpaca::AlpacaClient;
use crate::db::queries;
use crate::engine::{executor, EngineState};

// ─── Walk-Forward Analysis ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct WalkForwardRequest {
    pub strategy_id: Uuid,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub train_window_days: i64,
    pub test_window_days: i64,
    pub initial_capital: Option<f64>,
    pub commission_bps: Option<f64>,
    pub slippage_bps: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct WalkForwardResponse {
    pub windows: Vec<WalkForwardWindow>,
    pub total_runs: usize,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct WalkForwardWindow {
    pub window_index: usize,
    pub train_start: NaiveDate,
    pub train_end: NaiveDate,
    pub test_start: NaiveDate,
    pub test_end: NaiveDate,
    pub run_id: Uuid,
}

pub async fn walk_forward(
    pool: web::Data<PgPool>,
    engine: web::Data<EngineState>,
    alpaca: web::Data<AlpacaClient>,
    body: web::Json<WalkForwardRequest>,
) -> HttpResponse {
    let req = body.into_inner();

    // Validate strategy is active and runnable.
    let strategy = match queries::get_runnable_strategy(pool.get_ref(), req.strategy_id).await {
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "strategy not found or not runnable"
            }));
        }
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("failed to verify strategy: {}", e)
            }));
        }
        Ok(Some(s)) => s,
    };

    if let Some(code_key) = strategy.code_key.as_deref() {
        if crate::strategies::registry::get(code_key).is_none() {
            return HttpResponse::Conflict().json(serde_json::json!({
                "error": "strategy implementation is not available in this build"
            }));
        }
    }

    // Generate walk-forward windows
    let mut windows = Vec::new();
    let mut current_start = req.start_date;
    let mut window_idx = 0;

    let total_days = (req.end_date - req.start_date).num_days();
    let window_size = req.train_window_days + req.test_window_days;
    if window_size <= 0 || total_days < window_size {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "date range too small for the specified window sizes"
        }));
    }

    while current_start + chrono::Duration::days(window_size) <= req.end_date {
        let train_start = current_start;
        let train_end = current_start + chrono::Duration::days(req.train_window_days - 1);
        let test_start = train_end + chrono::Duration::days(1);
        let test_end = test_start + chrono::Duration::days(req.test_window_days - 1);

        if test_end > req.end_date {
            break;
        }

        // Create a benchmark run for the TEST window (strategy was "trained" on train window)
        let input = crate::db::models::CreateBenchmarkRun {
            strategy_id: req.strategy_id,
            start_date: test_start,
            end_date: test_end,
            initial_capital: req.initial_capital,
            commission_bps: req.commission_bps,
            slippage_bps: req.slippage_bps,
        };

        match queries::create_benchmark_run(pool.get_ref(), &input).await {
            Ok(run) => {
                engine.queue_run(run.id);
                if engine.start_run(run.id) {
                    let pool2 = pool.get_ref().clone();
                    let engine_arc = engine.clone().into_inner();
                    let alpaca2 = alpaca.get_ref().clone();
                    let run_id = run.id;
                    tokio::spawn(executor::execute_benchmark(pool2, engine_arc, run_id, alpaca2));
                }

                windows.push(WalkForwardWindow {
                    window_index: window_idx,
                    train_start,
                    train_end,
                    test_start,
                    test_end,
                    run_id: run.id,
                });
            }
            Err(e) => {
                tracing::error!("failed to create walk-forward run: {}", e);
            }
        }

        // Slide forward by test_window_days
        current_start = current_start + chrono::Duration::days(req.test_window_days);
        window_idx += 1;
    }

    let total_runs = windows.len();
    HttpResponse::Ok().json(WalkForwardResponse {
        windows,
        total_runs,
        message: format!("Created {} walk-forward windows", total_runs),
    })
}

// ─── Batch Backtest ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct BatchBacktestRequest {
    pub strategy_ids: Vec<Uuid>,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub initial_capital: Option<f64>,
    pub commission_bps: Option<f64>,
    pub slippage_bps: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct BatchBacktestResponse {
    pub runs: Vec<BatchRunInfo>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct BatchRunInfo {
    pub strategy_id: Uuid,
    pub run_id: Uuid,
    pub status: String,
}

pub async fn batch_backtest(
    pool: web::Data<PgPool>,
    engine: web::Data<EngineState>,
    alpaca: web::Data<AlpacaClient>,
    body: web::Json<BatchBacktestRequest>,
) -> HttpResponse {
    let req = body.into_inner();

    if req.strategy_ids.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "strategy_ids must not be empty"
        }));
    }

    if req.strategy_ids.len() > 20 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "maximum 20 strategies per batch"
        }));
    }

    let mut runs = Vec::new();

    for strategy_id in &req.strategy_ids {
        match queries::get_runnable_strategy(pool.get_ref(), *strategy_id).await {
            Ok(None) => {
                runs.push(BatchRunInfo {
                    strategy_id: *strategy_id,
                    run_id: Uuid::nil(),
                    status: "error: strategy not found or not runnable".to_string(),
                });
                continue;
            }
            Ok(Some(strategy)) => {
                if let Some(code_key) = strategy.code_key.as_deref() {
                    if crate::strategies::registry::get(code_key).is_none() {
                        runs.push(BatchRunInfo {
                            strategy_id: *strategy_id,
                            run_id: Uuid::nil(),
                            status: "error: strategy implementation unavailable".to_string(),
                        });
                        continue;
                    }
                }
            }
            Err(e) => {
                runs.push(BatchRunInfo {
                    strategy_id: *strategy_id,
                    run_id: Uuid::nil(),
                    status: format!("error: failed to verify strategy ({})", e),
                });
                continue;
            }
        }

        let input = crate::db::models::CreateBenchmarkRun {
            strategy_id: *strategy_id,
            start_date: req.start_date,
            end_date: req.end_date,
            initial_capital: req.initial_capital,
            commission_bps: req.commission_bps,
            slippage_bps: req.slippage_bps,
        };

        match queries::create_benchmark_run(pool.get_ref(), &input).await {
            Ok(run) => {
                engine.queue_run(run.id);
                if engine.start_run(run.id) {
                    let pool2 = pool.get_ref().clone();
                    let engine_arc = engine.clone().into_inner();
                    let alpaca2 = alpaca.get_ref().clone();
                    let run_id = run.id;
                    tokio::spawn(executor::execute_benchmark(pool2, engine_arc, run_id, alpaca2));
                }

                runs.push(BatchRunInfo {
                    strategy_id: *strategy_id,
                    run_id: run.id,
                    status: "queued".to_string(),
                });
            }
            Err(e) => {
                tracing::error!("failed to create batch run for {}: {}", strategy_id, e);
                runs.push(BatchRunInfo {
                    strategy_id: *strategy_id,
                    run_id: Uuid::nil(),
                    status: format!("error: {}", e),
                });
            }
        }
    }

    let total = runs.len();
    HttpResponse::Ok().json(BatchBacktestResponse { runs, total })
}

// ─── Parameter Optimization ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ParamOptimizeRequest {
    pub strategy_id: Uuid,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub initial_capital: Option<f64>,
    /// Parameters to sweep. Each entry is a param name and list of values to try.
    pub param_grid: std::collections::HashMap<String, Vec<serde_json::Value>>,
    pub optimize_metric: Option<String>, // default: "sharpe_ratio"
}

#[derive(Debug, Serialize)]
pub struct ParamOptimizeResponse {
    pub runs: Vec<ParamRunInfo>,
    pub total_combinations: usize,
    pub optimize_metric: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ParamRunInfo {
    pub run_id: Uuid,
    pub parameters: serde_json::Value,
}

pub async fn param_optimize(
    pool: web::Data<PgPool>,
    engine: web::Data<EngineState>,
    alpaca: web::Data<AlpacaClient>,
    body: web::Json<ParamOptimizeRequest>,
) -> HttpResponse {
    let req = body.into_inner();

    // Validate strategy
    let strategy = match queries::get_runnable_strategy(pool.get_ref(), req.strategy_id).await {
        Ok(Some(s)) => s,
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "strategy not found or not runnable"
            }));
        }
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("failed to verify strategy: {}", e)
            }));
        }
    };

    if let Some(code_key) = strategy.code_key.as_deref() {
        if crate::strategies::registry::get(code_key).is_none() {
            return HttpResponse::Conflict().json(serde_json::json!({
                "error": "strategy implementation is not available in this build"
            }));
        }
    }

    // Generate all parameter combinations (cartesian product)
    let param_names: Vec<String> = req.param_grid.keys().cloned().collect();
    let param_values: Vec<&Vec<serde_json::Value>> = param_names.iter()
        .map(|k| req.param_grid.get(k).unwrap())
        .collect();

    let combinations = cartesian_product(&param_values);
    let total_combinations = combinations.len();

    if total_combinations > 100 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("too many combinations ({}). Maximum 100.", total_combinations)
        }));
    }

    let optimize_metric = req.optimize_metric.unwrap_or_else(|| "sharpe_ratio".to_string());
    let mut runs = Vec::new();

    for combo in &combinations {
        // Build parameters by overlaying the sweep values on the strategy's existing params
        let mut params = strategy.parameters.clone();
        if let Some(obj) = params.as_object_mut() {
            for (i, name) in param_names.iter().enumerate() {
                obj.insert(name.clone(), combo[i].clone());
            }
        }

        let input = crate::db::models::CreateBenchmarkRun {
            strategy_id: req.strategy_id,
            start_date: req.start_date,
            end_date: req.end_date,
            initial_capital: req.initial_capital,
            commission_bps: None,
            slippage_bps: None,
        };

        match queries::create_benchmark_run(pool.get_ref(), &input).await {
            Ok(run) => {
                engine.queue_run(run.id);
                if engine.start_run(run.id) {
                    let pool2 = pool.get_ref().clone();
                    let engine_arc = engine.clone().into_inner();
                    let alpaca2 = alpaca.get_ref().clone();
                    let run_id = run.id;
                    tokio::spawn(executor::execute_benchmark(pool2, engine_arc, run_id, alpaca2));
                }

                runs.push(ParamRunInfo {
                    run_id: run.id,
                    parameters: params,
                });
            }
            Err(e) => {
                tracing::error!("failed to create optimization run: {}", e);
            }
        }
    }

    HttpResponse::Ok().json(ParamOptimizeResponse {
        runs,
        total_combinations,
        optimize_metric,
        message: format!("Created {} parameter optimization runs", total_combinations),
    })
}

fn cartesian_product(lists: &[&Vec<serde_json::Value>]) -> Vec<Vec<serde_json::Value>> {
    if lists.is_empty() {
        return vec![vec![]];
    }

    let mut result = Vec::new();
    let first = lists[0];
    let rest = cartesian_product(&lists[1..]);

    for item in first {
        for r in &rest {
            let mut combo = vec![item.clone()];
            combo.extend(r.clone());
            result.push(combo);
        }
    }

    result
}
