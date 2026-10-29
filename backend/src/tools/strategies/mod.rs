//! **Strategies Tool** - CRUD and lifecycle management for trading strategies.
//! 
//! ## Standalone Usage
//! ```bash
//! cargo run --bin strategies_cli -- list
//! cargo run --bin strategies_cli -- get --id <uuid>
//! cargo run --bin strategies_cli -- create --name "MyStrat" --type rl_portfolio_optimization
//! ```
//! 
//! ## Integration
//! Used by `/api/v1/strategies/*` endpoints.

pub mod core;
pub mod service;
pub mod cli;

pub use core::{CreateStrategy, UpdateStrategy};
pub use service::StrategyService;

#[cfg(test)]
mod tests;
