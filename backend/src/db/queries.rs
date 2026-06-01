use sqlx::PgPool;
use uuid::Uuid;

use super::models::*;

// -- strategies --

pub async fn list_strategies(pool: &PgPool, include_inactive: bool) -> Result<Vec<Strategy>, sqlx::Error> {
    sqlx::query_as::<_, Strategy>(
        r#"
        SELECT *
        FROM strategies
        WHERE ($1 OR is_active = TRUE)
        ORDER BY created_at DESC
        "#,
    )
        .bind(include_inactive)
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
        r#"INSERT INTO strategies (id, name, strategy_type, asset_class, status, is_active, description, parameters)
           VALUES ($1, $2, $3, $4, 'idle', TRUE, $5, $6)
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
        "UPDATE strategies SET status = $2, updated_at = NOW() WHERE id = $1 AND is_active = TRUE RETURNING *",
    )
    .bind(id)
    .bind(status)
    .fetch_one(pool)
    .await
}

pub async fn get_runnable_strategy(pool: &PgPool, id: Uuid) -> Result<Option<Strategy>, sqlx::Error> {
    sqlx::query_as::<_, Strategy>(
        r#"
        SELECT *
        FROM strategies
        WHERE id = $1
          AND is_active = TRUE
          AND code_key IS NOT NULL
          AND status <> 'retired'
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn strategy_has_active_runs(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
    let row: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM benchmark_runs
        WHERE strategy_id = $1
          AND status IN ('queued', 'running')
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    Ok(row.0 > 0)
}

pub async fn delete_strategy(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"
        UPDATE strategies
        SET is_active = FALSE,
            status = 'retired',
            retired_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND is_active = TRUE
        "#,
    )
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

// -- full benchmark runs (with nested data) --

pub async fn get_full_benchmark_run(
    pool: &PgPool,
    id: Uuid,
) -> Result<Option<FullBenchmarkRun>, sqlx::Error> {
    let run = match get_benchmark_run(pool, id).await? {
        Some(r) => r,
        None => return Ok(None),
    };
    Ok(Some(assemble_full_run(pool, run).await?))
}

pub async fn list_full_benchmark_runs(pool: &PgPool) -> Result<Vec<FullBenchmarkRun>, sqlx::Error> {
    let runs = list_benchmark_runs(pool).await?;
    let mut result = Vec::with_capacity(runs.len());
    for run in runs {
        result.push(assemble_full_run(pool, run).await?);
    }
    Ok(result)
}

async fn assemble_full_run(pool: &PgPool, run: BenchmarkRun) -> Result<FullBenchmarkRun, sqlx::Error> {
    let strategy_name = get_strategy(pool, run.strategy_id)
        .await?
        .map(|s| s.name)
        .unwrap_or_else(|| run.strategy_id.to_string());

    let metrics = get_metrics_for_run(pool, run.id).await?;
    let equity_snapshots = get_equity_curve(pool, run.id).await?;
    let trades = get_trades_for_run(pool, run.id, 1000, 0).await?;

    Ok(FullBenchmarkRun {
        id: run.id,
        strategy_id: run.strategy_id,
        strategy_name,
        start_date: run.start_date,
        end_date: run.end_date,
        status: run.status,
        duration_ms: run.duration_ms,
        initial_capital: run.initial_capital,
        commission_bps: run.commission_bps,
        slippage_bps: run.slippage_bps,
        started_at: run.started_at,
        completed_at: run.completed_at,
        metrics,
        equity_snapshots,
        trades,
    })
}
