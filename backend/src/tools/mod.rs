//! Compartmentalized trading tools -- each can run standalone or integrated into the UI.
//! 
//! Each tool is self-contained with:
//! - Core business logic (lib.rs or mod.rs)
//! - Optional CLI runner (cli.rs)
//! - Tests (tests.rs)
//! - Documentation (README.md)
//! 
//! Import patterns:
//! - Use from main API routes: `use crate::tools::strategies::*;`
//! - CLI: `cargo run --bin [tool_name]`

pub mod strategies;
pub mod tuning;
pub mod benchmarking;
pub mod paper_trading;
pub mod market_data;
pub mod finrl_integration;
