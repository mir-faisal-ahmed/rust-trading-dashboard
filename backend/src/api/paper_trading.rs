//! Paper Trading API endpoints.
//! Full-fledged paper trading via Alpaca: account, positions, orders, portfolio history.

use actix_web::{web, HttpResponse};
use serde::Deserialize;

use crate::data::trading::{
    ClosePositionRequest, OrderRequest, PaperTradingClient,
};

// ─── Account ─────────────────────────────────────────────────────────────────

pub async fn get_account(
    trading: web::Data<PaperTradingClient>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    match trading.get_account().await {
        Ok(account) => HttpResponse::Ok().json(account),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

// ─── Positions ───────────────────────────────────────────────────────────────

pub async fn get_positions(
    trading: web::Data<PaperTradingClient>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    match trading.get_positions().await {
        Ok(positions) => HttpResponse::Ok().json(positions),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

pub async fn close_position(
    trading: web::Data<PaperTradingClient>,
    path: web::Path<String>,
    body: web::Json<ClosePositionRequest>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    let symbol = path.into_inner();
    match trading.close_position(&symbol, &body).await {
        Ok(order) => HttpResponse::Ok().json(order),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

pub async fn close_all_positions(
    trading: web::Data<PaperTradingClient>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    match trading.close_all_positions().await {
        Ok(orders) => HttpResponse::Ok().json(orders),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

pub async fn submit_order(
    trading: web::Data<PaperTradingClient>,
    body: web::Json<OrderRequest>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    // Validate required fields
    let order = body.into_inner();
    if order.symbol.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "symbol is required"
        }));
    }
    if order.qty.is_none() && order.notional.is_none() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "either qty or notional is required"
        }));
    }

    match trading.submit_order(&order).await {
        Ok(placed) => HttpResponse::Ok().json(placed),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

#[derive(Deserialize)]
pub struct OrdersQuery {
    pub status: Option<String>,
    pub limit: Option<i32>,
}

pub async fn get_orders(
    trading: web::Data<PaperTradingClient>,
    query: web::Query<OrdersQuery>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    let status = query.status.as_deref().unwrap_or("all");
    let limit = query.limit.unwrap_or(50).min(500);

    match trading.get_orders(status, limit).await {
        Ok(orders) => HttpResponse::Ok().json(orders),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

pub async fn cancel_order(
    trading: web::Data<PaperTradingClient>,
    path: web::Path<String>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    let order_id = path.into_inner();
    match trading.cancel_order(&order_id).await {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({
            "status": "cancelled",
            "order_id": order_id,
        })),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

pub async fn cancel_all_orders(
    trading: web::Data<PaperTradingClient>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    match trading.cancel_all_orders().await {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({
            "status": "all_cancelled"
        })),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

// ─── Portfolio History ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct PortfolioHistoryQuery {
    pub period: Option<String>,
    pub timeframe: Option<String>,
}

pub async fn get_portfolio_history(
    trading: web::Data<PaperTradingClient>,
    query: web::Query<PortfolioHistoryQuery>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    let period = query.period.as_deref().unwrap_or("1M");
    let timeframe = query.timeframe.as_deref().unwrap_or("1D");

    match trading.get_portfolio_history(period, timeframe).await {
        Ok(history) => HttpResponse::Ok().json(history),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

// ─── Activities ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ActivitiesQuery {
    pub activity_type: Option<String>,
    pub limit: Option<i32>,
}

pub async fn get_activities(
    trading: web::Data<PaperTradingClient>,
    query: web::Query<ActivitiesQuery>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    let limit = query.limit.unwrap_or(50).min(500);

    match trading.get_activities(query.activity_type.as_deref(), limit).await {
        Ok(activities) => HttpResponse::Ok().json(activities),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}

// ─── Sync (full state refresh) ───────────────────────────────────────────────

pub async fn sync_state(
    trading: web::Data<PaperTradingClient>,
) -> HttpResponse {
    if !trading.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca credentials not configured"
        }));
    }

    match trading.sync_state().await {
        Ok(state) => HttpResponse::Ok().json(state),
        Err(e) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": e
        })),
    }
}
