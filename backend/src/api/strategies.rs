use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::{models::CreateStrategy, queries};

#[derive(serde::Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub include_inactive: bool,
}

pub async fn list(pool: web::Data<PgPool>, q: web::Query<ListQuery>) -> HttpResponse {
    match queries::list_strategies(pool.get_ref(), q.include_inactive).await {
        Ok(strategies) => HttpResponse::Ok().json(strategies),
        Err(e) => {
            tracing::error!("failed to list strategies: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to fetch strategies"
            }))
        }
    }
}

pub async fn get(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> HttpResponse {
    let id = path.into_inner();
    match queries::get_strategy(pool.get_ref(), id).await {
        Ok(Some(strategy)) => HttpResponse::Ok().json(strategy),
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({
            "error": "strategy not found"
        })),
        Err(e) => {
            tracing::error!("failed to get strategy {}: {}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to fetch strategy"
            }))
        }
    }
}

pub async fn create(
    pool: web::Data<PgPool>,
    body: web::Json<CreateStrategy>,
) -> HttpResponse {
    match queries::create_strategy(pool.get_ref(), &body.into_inner()).await {
        Ok(strategy) => HttpResponse::Created().json(strategy),
        Err(e) => {
            tracing::error!("failed to create strategy: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to create strategy"
            }))
        }
    }
}

#[derive(serde::Deserialize)]
pub struct StatusUpdate {
    pub status: String,
}

pub async fn update_status(
    pool: web::Data<PgPool>,
    path: web::Path<Uuid>,
    body: web::Json<StatusUpdate>,
) -> HttpResponse {
    let id = path.into_inner();
    match queries::update_strategy_status(pool.get_ref(), id, &body.status).await {
        Ok(strategy) => HttpResponse::Ok().json(strategy),
        Err(e) => {
            tracing::error!("failed to update strategy status {}: {}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to update strategy status"
            }))
        }
    }
}

pub async fn delete(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> HttpResponse {
    let id = path.into_inner();

    match queries::strategy_has_active_runs(pool.get_ref(), id).await {
        Ok(true) => {
            return HttpResponse::Conflict().json(serde_json::json!({
                "error": "strategy has queued/running benchmark runs"
            }));
        }
        Ok(false) => {}
        Err(e) => {
            tracing::error!("failed to check strategy active runs {}: {}", id, e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to validate strategy deletion"
            }));
        }
    }

    match queries::delete_strategy(pool.get_ref(), id).await {
        Ok(rows) if rows > 0 => HttpResponse::NoContent().finish(),
        Ok(_) => HttpResponse::NotFound().json(serde_json::json!({
            "error": "strategy not found"
        })),
        Err(e) => {
            tracing::error!("failed to delete strategy {}: {}", id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to delete strategy"
            }))
        }
    }
}
