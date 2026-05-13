use sqlx::PgPool;
use uuid::Uuid;

use super::models::*;

// -- strategies --

pub async fn list_strategies(pool: &PgPool) -> Result<Vec<Strategy>, sqlx::Error> {
    sqlx::query_as::<_, Strategy>("SELECT * FROM strategies ORDER BY created_at DESC")
        .fetch_all(pool)
        .await
}

pub async fn get_strategy(pool: &PgPool, id: Uuid) -> Result<Option<Strategy>, sqlx::Error> {
    sqlx::query_as::<_, Strategy>("SELECT * FROM strategies WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn create_strategy(pool: &PgPool, input: &CreateStrategy) -> Result<Strategy, sqlx::Error> {
    sqlx::query_as::<_, Strategy>(
        r#"INSERT INTO strategies (id, name, strategy_type, asset_class, status, description, parameters)
           VALUES ($1, $2, $3, $4, 'idle', $5, $6)
           RETURNING *"#,
    )
    .bind(Uuid::new_v4())
    .bind(&input.name)
    .bind(&input.strategy_type)
    .bind(&input.asset_class)
    .bind(&input.description)
    .bind(&input.parameters)
    .fetch_one(pool)
    .await
}

pub async fn update_strategy_status(
    pool: &PgPool,
    id: Uuid,
    status: &str,
) -> Result<Strategy, sqlx::Error> {
    sqlx::query_as::<_, Strategy>(
        "UPDATE strategies SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(status)
    .fetch_one(pool)
    .await
}

pub async fn delete_strategy(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
    let result = sqlx::query("DELETE FROM strategies WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

// -- benchmark runs --

pub async fn list_benchmark_runs(pool: &PgPool) -> Result<Vec<BenchmarkRun>, sqlx::Error> {
    sqlx::query_as::<_, BenchmarkRun>(
        "SELECT * FROM benchmark_runs ORDER BY started_at DESC",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_benchmark_run(pool: &PgPool, id: Uuid) -> Result<Option<BenchmarkRun>, sqlx::Error> {
    sqlx::query_as::<_, BenchmarkRun>("SELECT * FROM benchmark_runs WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn create_benchmark_run(
    pool: &PgPool,
    input: &CreateBenchmarkRun,
) -> Result<BenchmarkRun, sqlx::Error> {
    sqlx::query_as::<_, BenchmarkRun>(
        r#"INSERT INTO benchmark_runs
           (id, strategy_id, start_date, end_date, status, initial_capital, commission_bps, slippage_bps)
           VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7)
           RETURNING *"#,
    )
    .bind(Uuid::new_v4())
    .bind(input.strategy_id)
    .bind(input.start_date)
    .bind(input.end_date)
    .bind(input.initial_capital.unwrap_or(100_000.0))
    .bind(input.commission_bps.unwrap_or(10.0))
    .bind(input.slippage_bps.unwrap_or(5.0))
    .fetch_one(pool)
    .await
}

// -- metrics --

pub async fn get_metrics_for_run(
    pool: &PgPool,
    run_id: Uuid,
) -> Result<Option<PerformanceMetrics>, sqlx::Error> {
    sqlx::query_as::<_, PerformanceMetrics>(
        "SELECT * FROM performance_metrics WHERE benchmark_run_id = $1",
    )
    .bind(run_id)
    .fetch_optional(pool)
    .await
}

// -- trades --

pub async fn get_trades_for_run(
    pool: &PgPool,
    run_id: Uuid,
    limit: i64,
    offset: i64,
) -> Result<Vec<Trade>, sqlx::Error> {
    sqlx::query_as::<_, Trade>(
        "SELECT * FROM trades WHERE benchmark_run_id = $1 ORDER BY entry_time DESC LIMIT $2 OFFSET $3",
    )
    .bind(run_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
}

// -- equity snapshots --

pub async fn get_equity_curve(
    pool: &PgPool,
    run_id: Uuid,
) -> Result<Vec<EquitySnapshot>, sqlx::Error> {
    sqlx::query_as::<_, EquitySnapshot>(
        "SELECT * FROM equity_snapshots WHERE benchmark_run_id = $1 ORDER BY timestamp ASC",
    )
    .bind(run_id)
    .fetch_all(pool)
    .await
}
