use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::{models::CreateBenchmarkRun, queries};
use crate::engine::EngineState;

pub async fn list(pool: web::Data<PgPool>) -> HttpResponse {
    match queries::list_benchmark_runs(pool.get_ref()).await {
        Ok(runs) => HttpResponse::Ok().json(runs),
        Err(e) => {
            tracing::error!("failed to list benchmark runs: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to fetch benchmark runs"
            }))
        }
    }
}

pub async fn list_full(pool: web::Data<PgPool>) -> HttpResponse {
    match queries::list_full_benchmark_runs(pool.get_ref()).await {
        Ok(runs) => HttpResponse::Ok().json(runs),
        Err(e) => {
            tracing::error!("failed to list full benchmark runs: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to fetch benchmark runs"
            }))
        }
    }
}

pub async fn get(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> HttpResponse {
    let id = path.into_inner();
    match queries::get_benchmark_run(pool.get_ref(), id).await {
        Ok(Some(run)) => HttpResponse::Ok().json(run),
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({
            "error": "benchmark run not found"
        })),
        Err(e) => {
            tracing::error!("failed to get benchmark run {}: {}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to fetch benchmark run"
            }))
        }
    }
}

pub async fn get_full(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> HttpResponse {
    let id = path.into_inner();
    match queries::get_full_benchmark_run(pool.get_ref(), id).await {
        Ok(Some(run)) => HttpResponse::Ok().json(run),
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({
            "error": "benchmark run not found"
        })),
        Err(e) => {
            tracing::error!("failed to get full benchmark run {}: {}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to fetch benchmark run"
            }))
        }
    }
}

pub async fn create(
    pool: web::Data<PgPool>,
    engine: web::Data<EngineState>,
    body: web::Json<CreateBenchmarkRun>,
) -> HttpResponse {
    let input = body.into_inner();

    match queries::get_strategy(pool.get_ref(), input.strategy_id).await {
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "strategy not found"
            }));
        }
        Err(e) => {
            tracing::error!("failed to verify strategy: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to verify strategy"
            }));
        }
        Ok(Some(_)) => {}
    }

    match queries::create_benchmark_run(pool.get_ref(), &input).await {
        Ok(run) => {
            engine.queue_run(run.id);
            HttpResponse::Created().json(run)
        }
        Err(e) => {
            tracing::error!("failed to create benchmark run: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to create benchmark run"
            }))
        }
    }
}

pub async fn get_metrics(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> HttpResponse {
    let id = path.into_inner();
    match queries::get_metrics_for_run(pool.get_ref(), id).await {
        Ok(Some(metrics)) => HttpResponse::Ok().json(metrics),
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({
            "error": "metrics not found for this run"
        })),
        Err(e) => {
            tracing::error!("failed to get metrics for run {}: {}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to fetch metrics"
            }))
        }
    }
}

pub async fn get_equity(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> HttpResponse {
    let id = path.into_inner();
    match queries::get_equity_curve(pool.get_ref(), id).await {
        Ok(snapshots) => HttpResponse::Ok().json(snapshots),
        Err(e) => {
            tracing::error!("failed to get equity curve for run {}: {}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to fetch equity curve"
            }))
        }
    }
}
