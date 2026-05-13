// Benchmark execution logic.
// This module handles running a strategy against historical data
// and computing all performance metrics.
//
// In production, this would:
// 1. Load the strategy configuration from the database
// 2. Fetch historical data from the configured data source
// 3. Run the strategy logic (possibly calling out to a Python sidecar for ML strategies)
// 4. Record trades, equity snapshots, and final metrics
//
// For ML/LLM strategies, the executor communicates with a Python gRPC service
// that hosts the model inference. This keeps the execution loop fast (Rust)
// while allowing flexible model deployment (Python).

use sqlx::PgPool;
use uuid::Uuid;

use super::EngineState;

/// Executes a single benchmark run to completion.
/// This is spawned as a tokio task from the run scheduler.
pub async fn execute_benchmark(
    pool: PgPool,
    engine: EngineState,
    run_id: Uuid,
) {
    tracing::info!("starting benchmark execution for run {}", run_id);

    // mark as running
    let _update = sqlx::query(
        "UPDATE benchmark_runs SET status = 'running' WHERE id = $1"
    )
    .bind(run_id)
    .execute(&pool)
    .await;

    // fetch run config
    let run = match sqlx::query_as::<_, crate::db::models::BenchmarkRun>(
        "SELECT * FROM benchmark_runs WHERE id = $1"
    )
    .bind(run_id)
    .fetch_optional(&pool)
    .await
    {
        Ok(Some(r)) => r,
        Ok(None) => {
            tracing::error!("benchmark run {} not found", run_id);
            engine.complete_run(run_id);
            return;
        }
        Err(e) => {
            tracing::error!("failed to fetch benchmark run {}: {}", run_id, e);
            engine.complete_run(run_id);
            return;
        }
    };

    // fetch strategy config
    let strategy = match sqlx::query_as::<_, crate::db::models::Strategy>(
        "SELECT * FROM strategies WHERE id = $1"
    )
    .bind(run.strategy_id)
    .fetch_optional(&pool)
    .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            tracing::error!("strategy {} not found for run {}", run.strategy_id, run_id);
            engine.complete_run(run_id);
            return;
        }
        Err(e) => {
            tracing::error!("failed to fetch strategy: {}", e);
            engine.complete_run(run_id);
            return;
        }
    };

    let start_time = std::time::Instant::now();

    // -- STRATEGY EXECUTION GOES HERE --
    // This is where you plug in your strategy logic.
    // For ML strategies, call out to the Python model server via gRPC.
    // For traditional strategies, implement the logic directly in Rust.
    //
    // The execution loop:
    // 1. Iterate over each bar/tick in the historical data
    // 2. Pass market state to the strategy
    // 3. Collect order signals
    // 4. Simulate execution with slippage and commission
    // 5. Track equity and drawdown
    // 6. Record each trade

    tracing::info!(
        "executing strategy '{}' (type: {}) for period {} to {}",
        strategy.name,
        strategy.strategy_type,
        run.start_date,
        run.end_date,
    );

    // placeholder: sleep to simulate computation
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let duration_ms = start_time.elapsed().as_millis() as i64;

    // mark as completed
    let _update = sqlx::query(
        "UPDATE benchmark_runs SET status = 'completed', duration_ms = $2, completed_at = NOW() WHERE id = $1"
    )
    .bind(run_id)
    .bind(duration_ms)
    .execute(&pool)
    .await;

    // update strategy status
    let _update = sqlx::query(
        "UPDATE strategies SET status = 'completed', updated_at = NOW() WHERE id = $1"
    )
    .bind(run.strategy_id)
    .execute(&pool)
    .await;

    engine.complete_run(run_id);
    tracing::info!("benchmark run {} completed in {}ms", run_id, duration_ms);
}
