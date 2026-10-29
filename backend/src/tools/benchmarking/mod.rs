//! **Benchmarking Tool** - Backtest execution and performance metrics collection.
//! 
//! ## Standalone Usage
//! ```bash
//! cargo run --bin benchmarking_cli -- run --strategy-id <uuid> --start 2024-01-01 --end 2024-12-31
//! cargo run --bin benchmarking_cli -- list-runs
//! cargo run --bin benchmarking_cli -- metrics --run-id <uuid>
//! ```
//! 
//! ## Integration
//! - `/api/v1/benchmarks` - create and list runs
//! - `/api/v1/benchmarks/{id}/full` - retrieve full results with metrics & equity curve

pub mod core;
pub mod service;
pub mod executor;
pub mod metrics;
pub mod cli;

pub use core::{CreateBenchmarkRun, BenchmarkStatus};
pub use service::BenchmarkService;
pub use metrics::{PerformanceMetrics, compute_metrics};

#[cfg(test)]
mod tests;
