use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Strategy {
    pub id: Uuid,
    pub code_key: Option<String>,
    pub name: String,
    pub strategy_type: String,
    pub asset_class: String,
    pub status: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateStrategy {
    pub name: String,
    pub strategy_type: String,
    pub asset_class: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct BenchmarkRun {
    pub id: Uuid,
    pub strategy_id: Uuid,
    pub start_date: chrono::NaiveDate,
    pub end_date: chrono::NaiveDate,
    pub status: String,
    pub duration_ms: Option<i64>,
    pub initial_capital: f64,
    pub commission_bps: f64,
    pub slippage_bps: f64,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBenchmarkRun {
    pub strategy_id: Uuid,
    pub start_date: chrono::NaiveDate,
    pub end_date: chrono::NaiveDate,
    pub initial_capital: Option<f64>,
    pub commission_bps: Option<f64>,
    pub slippage_bps: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PerformanceMetrics {
    pub id: Uuid,
    pub benchmark_run_id: Uuid,
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
    pub total_trades: i32,
    pub avg_trade_return_pct: f64,
    pub avg_win_pct: f64,
    pub avg_loss_pct: f64,
    pub expectancy: f64,
    pub avg_holding_period_hours: f64,
    pub skewness: f64,
    pub kurtosis: f64,
    pub var_95_pct: f64,
    pub cvar_95_pct: f64,
    pub beta: f64,
    pub alpha_ann_pct: f64,
    pub information_ratio: f64,
    pub treynor_ratio: f64,
    pub omega_ratio: f64,
    pub tail_ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Trade {
    pub id: Uuid,
    pub benchmark_run_id: Uuid,
    pub strategy_id: Uuid,
    pub symbol: String,
    pub side: String,
    pub entry_price: f64,
    pub exit_price: f64,
    pub quantity: f64,
    pub entry_time: DateTime<Utc>,
    pub exit_time: DateTime<Utc>,
    pub pnl: f64,
    pub pnl_pct: f64,
    pub fees: f64,
    pub slippage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EquitySnapshot {
    pub id: Uuid,
    pub benchmark_run_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub equity: f64,
    pub benchmark_equity: f64,
    pub drawdown_pct: f64,
}

/// Full benchmark run with nested strategy name, metrics, equity curve, and trades.
/// Returned by the /benchmarks/:id/full and /benchmarks/full endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullBenchmarkRun {
    pub id: Uuid,
    pub strategy_id: Uuid,
    pub strategy_name: String,
    pub start_date: chrono::NaiveDate,
    pub end_date: chrono::NaiveDate,
    pub status: String,
    pub duration_ms: Option<i64>,
    pub initial_capital: f64,
    pub commission_bps: f64,
    pub slippage_bps: f64,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub metrics: Option<PerformanceMetrics>,
    pub equity_snapshots: Vec<EquitySnapshot>,
    pub trades: Vec<Trade>,
}
