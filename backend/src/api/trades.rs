use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::queries;

#[derive(serde::Deserialize)]
pub struct PaginationParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_for_run(
    pool: web::Data<PgPool>,
    path: web::Path<Uuid>,
    query: web::Query<PaginationParams>,
) -> HttpResponse {
    let run_id = path.into_inner();
    let limit = query.limit.unwrap_or(100).min(1000);
    let offset = query.offset.unwrap_or(0);

    match queries::get_trades_for_run(pool.get_ref(), run_id, limit, offset).await {
        Ok(trades) => HttpResponse::Ok().json(trades),
        Err(e) => {
            tracing::error!("failed to get trades for run {}: {}", run_id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to fetch trades"
            }))
        }
    }
}
