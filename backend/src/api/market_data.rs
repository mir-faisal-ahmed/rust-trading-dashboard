use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::data::alpaca::{self, AlpacaClient};

#[derive(Deserialize)]
pub struct FetchRequest {
    pub symbol: String,
    /// Alpaca timeframe string: "1Day", "1Hour", "5Min", etc.
    pub timeframe: String,
    /// ISO date string: "2023-01-01"
    pub start: String,
    /// ISO date string: "2024-12-31"
    pub end: String,
    /// Set true for crypto symbols like "BTC/USD"
    #[serde(default)]
    pub crypto: bool,
}

#[derive(Serialize)]
struct FetchResponse {
    symbol: String,
    timeframe: String,
    bars_fetched: usize,
    bars_inserted: u64,
}

pub async fn fetch_and_store(
    pool: web::Data<PgPool>,
    alpaca: web::Data<AlpacaClient>,
    body: web::Json<FetchRequest>,
) -> HttpResponse {
    if !alpaca.is_configured() {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "Alpaca API credentials not configured"
        }));
    }

    let req = body.into_inner();

    let bars = if req.crypto {
        alpaca
            .fetch_crypto_bars(&req.symbol, &req.timeframe, &req.start, &req.end)
            .await
    } else {
        alpaca
            .fetch_stock_bars(&req.symbol, &req.timeframe, &req.start, &req.end)
            .await
    };

    let bars = match bars {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("alpaca fetch failed for {}: {}", req.symbol, e);
            return HttpResponse::BadGateway().json(serde_json::json!({ "error": e }));
        }
    };

    let fetched = bars.len();

    let inserted = match alpaca::store_bars(pool.get_ref(), &req.symbol, &req.timeframe, &bars).await {
        Ok(n) => n,
        Err(e) => {
            tracing::error!("failed to store bars for {}: {}", req.symbol, e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to store market data"
            }));
        }
    };

    tracing::info!(
        "stored {}/{} bars for {} ({})",
        inserted,
        fetched,
        req.symbol,
        req.timeframe
    );

    HttpResponse::Ok().json(FetchResponse {
        symbol: req.symbol,
        timeframe: req.timeframe,
        bars_fetched: fetched,
        bars_inserted: inserted,
    })
}

#[derive(Deserialize)]
pub struct QueryParams {
    pub timeframe: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
    pub limit: Option<i64>,
}

pub async fn query_bars(
    pool: web::Data<PgPool>,
    symbol: web::Path<String>,
    params: web::Query<QueryParams>,
) -> HttpResponse {
    let symbol = symbol.into_inner();
    let timeframe = params.timeframe.as_deref().unwrap_or("1Day");
    let limit = params.limit.unwrap_or(500);

    let rows = sqlx::query_as::<_, (chrono::DateTime<chrono::Utc>, f64, f64, f64, f64, i64)>(
        r#"SELECT ts, open, high, low, close, volume
           FROM market_bars
           WHERE symbol = $1
             AND timeframe = $2
             AND ($3::timestamptz IS NULL OR ts >= $3::timestamptz)
             AND ($4::timestamptz IS NULL OR ts <= $4::timestamptz)
           ORDER BY ts ASC
           LIMIT $5"#,
    )
    .bind(&symbol)
    .bind(timeframe)
    .bind(&params.start)
    .bind(&params.end)
    .bind(limit)
    .fetch_all(pool.get_ref())
    .await;

    match rows {
        Ok(rows) => {
            let bars: Vec<_> = rows
                .into_iter()
                .map(|(ts, o, h, l, c, v)| {
                    serde_json::json!({
                        "t": ts,
                        "o": o,
                        "h": h,
                        "l": l,
                        "c": c,
                        "v": v,
                    })
                })
                .collect();
            HttpResponse::Ok().json(serde_json::json!({
                "symbol": symbol,
                "timeframe": timeframe,
                "bars": bars,
            }))
        }
        Err(e) => {
            tracing::error!("failed to query bars for {}: {}", symbol, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed to query market data"
            }))
        }
    }
}

#[derive(Serialize)]
struct StatusResponse {
    configured: bool,
    symbols: Vec<SymbolInfo>,
}

#[derive(Serialize, sqlx::FromRow)]
struct SymbolInfo {
    symbol: String,
    timeframe: String,
    bar_count: i64,
    earliest: Option<chrono::DateTime<chrono::Utc>>,
    latest: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn status(
    pool: web::Data<PgPool>,
    alpaca: web::Data<AlpacaClient>,
) -> HttpResponse {
    let symbols = sqlx::query_as::<_, SymbolInfo>(
        r#"SELECT symbol, timeframe,
                  COUNT(*) as bar_count,
                  MIN(ts) as earliest,
                  MAX(ts) as latest
           FROM market_bars
           GROUP BY symbol, timeframe
           ORDER BY symbol, timeframe"#,
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    HttpResponse::Ok().json(StatusResponse {
        configured: alpaca.is_configured(),
        symbols,
    })
}
