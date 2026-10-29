//! **Paper Trading Tool** - Simulated trading engine for strategy testing.
//! 
//! ## Standalone Usage
//! ```bash
//! cargo run --bin paper_trading_cli -- account
//! cargo run --bin paper_trading_cli -- positions
//! cargo run --bin paper_trading_cli -- submit-order --symbol AAPL --side buy --qty 10
//! cargo run --bin paper_trading_cli -- close-all
//! ```
//! 
//! ## Integration
//! - `/api/v1/trading/*` endpoints for account, positions, orders, portfolio history

pub mod core;
pub mod engine;
pub mod service;
pub mod cli;

pub use core::{PaperAccount, PaperPosition, OrderRequest, PaperOrder};
pub use service::PaperTradingService;

#[cfg(test)]
mod tests;
