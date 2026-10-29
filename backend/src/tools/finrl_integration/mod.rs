//! **FinRL Integration Tool** - gRPC integration with FinRL Python service for RL strategy execution.
//! 
//! ## Standalone Usage
//! ```bash
//! cargo run --bin finrl_cli -- health
//! cargo run --bin finrl_cli -- load-model --model-id td3_v1
//! cargo run --bin finrl_cli -- predict --model-id td3_v1 --features "[1.0, 0.5, ...]"
//! ```
//! 
//! ## Integration
//! - Used by FinRL strategies (PPO, SAC, A2C, TD3) in `/strategies/`
//! - gRPC endpoint: `FINRL_GRPC_ENDPOINT` env var

pub mod core;
pub mod client;
pub mod strategies;
pub mod cli;

pub use core::FinRLClient;

#[cfg(test)]
mod tests;
