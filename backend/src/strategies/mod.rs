pub mod indicators;
pub mod registry;
pub mod xgboost_classifier;
pub mod rl_market_maker;

use uuid::Uuid;

/// Single OHLCV bar as loaded from market_bars.
#[derive(Debug, Clone)]
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
#[derive(Debug, Clone)]
pub struct RawTrade {
    pub symbol: String,
    pub side: String,
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

/// Compile-time metadata describing a strategy implementation.
pub struct StrategyMeta {
    /// Stable code identifier — never changes after the strategy ships.
    pub code_key: &'static str,
    pub name: &'static str,
    pub strategy_type: &'static str,
    pub asset_class: &'static str,
    pub description: &'static str,
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
