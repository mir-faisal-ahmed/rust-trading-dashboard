//! **Market Data Tool** - Historical and real-time market data fetching & caching.
//! 
//! ## Standalone Usage
//! ```bash
//! cargo run --bin market_data_cli -- fetch --symbol AAPL --start 2024-01-01 --end 2024-12-31
//! cargo run --bin market_data_cli -- status
//! cargo run --bin market_data_cli -- get-bars --symbol AAPL --limit 100
//! ```
//! 
//! ## Integration
//! - `/api/v1/market-data/*` endpoints for fetch, status, and bar retrieval

pub mod core;
pub mod service;
pub mod alpaca_client;
pub mod cli;

pub use core::{MarketDataStatus, BarData};
pub use service::MarketDataService;

#[cfg(test)]
mod tests;
