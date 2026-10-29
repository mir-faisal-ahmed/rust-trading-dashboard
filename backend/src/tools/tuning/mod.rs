//! **Tuning Tool** - Parameter tuning jobs (manual, auto, LLM) with reproducibility & MoA.
//! 
//! ## Standalone Usage
//! ```bash
//! cargo run --bin tuning_cli -- list-jobs --strategy-id <uuid>
//! cargo run --bin tuning_cli -- create-job --mode llm --objective sharpe_ratio --models "td3_v1,ppo_v1"
//! cargo run --bin tuning_cli -- show-job --id <uuid>
//! ```
//! 
//! ## Integration
//! - Tuning job creation/retrieval via `/api/v1/strategies/{id}/tuning-jobs`
//! - MoA workflow seeding: stores agent definitions, discussion rounds, recommendations
//! - Reproducibility: parameter_hash, model_name, backtest date range

pub mod core;
pub mod service;
pub mod moa;
pub mod reproducibility;
pub mod cli;

pub use core::{CreateStrategyTuningJob, TuningJobMode};
pub use service::TuningService;
pub use moa::MoAWorkflow;
pub use reproducibility::{ParameterHash, compute_parameter_hash};

#[cfg(test)]
mod tests;
