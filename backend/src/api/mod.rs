pub mod benchmarks;
pub mod market_data;
pub mod strategies;
pub mod trades;

use actix_web::web;

pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .service(
                web::resource("/strategies")
                    .route(web::get().to(strategies::list))
                    .route(web::post().to(strategies::create)),
            )
            .service(
                web::resource("/strategies/{id}")
                    .route(web::get().to(strategies::get))
                    .route(web::delete().to(strategies::delete)),
            )
            .service(
                web::resource("/strategies/{id}/status")
                    .route(web::put().to(strategies::update_status)),
            )
            .service(
                web::resource("/benchmarks")
                    .route(web::get().to(benchmarks::list))
                    .route(web::post().to(benchmarks::create)),
            )
            .service(
                web::resource("/benchmarks/full")
                    .route(web::get().to(benchmarks::list_full)),
            )
            .service(
                web::resource("/benchmarks/{id}")
                    .route(web::get().to(benchmarks::get)),
            )
            .service(
                web::resource("/benchmarks/{id}/full")
                    .route(web::get().to(benchmarks::get_full)),
            )
            .service(
                web::resource("/benchmarks/{id}/metrics")
                    .route(web::get().to(benchmarks::get_metrics)),
            )
            .service(
                web::resource("/benchmarks/{id}/equity")
                    .route(web::get().to(benchmarks::get_equity)),
            )
            .service(
                web::resource("/benchmarks/{id}/trades")
                    .route(web::get().to(trades::list_for_run)),
            )
            .service(
                web::resource("/market-data/fetch")
                    .route(web::post().to(market_data::fetch_and_store)),
            )
            .service(
                web::resource("/market-data/status")
                    .route(web::get().to(market_data::status)),
            )
            .service(
                web::resource("/market-data/{symbol}")
                    .route(web::get().to(market_data::query_bars)),
            )
            .service(
                web::resource("/config/status")
                    .route(web::get().to(config_status)),
            )
            .service(
                web::resource("/training/start")
                    .route(web::post().to(training_start)),
            )
            .service(
                web::resource("/training/status")
                    .route(web::get().to(training_status)),
            )
            .service(
                web::resource("/training/data-summary")
                    .route(web::get().to(training_data_summary)),
            )
            .service(
                web::resource("/health")
                    .route(web::get().to(health)),
            ),
    );
}

async fn health() -> actix_web::HttpResponse {
    actix_web::HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn config_status(
    alpaca: web::Data<crate::data::alpaca::AlpacaClient>,
) -> actix_web::HttpResponse {
    let finrl_endpoint = std::env::var("FINRL_GRPC_ENDPOINT").unwrap_or_default();
    let redis_url = std::env::var("REDIS_URL").unwrap_or_default();

    actix_web::HttpResponse::Ok().json(serde_json::json!({
        "data_sources": [
            {
                "name": "Alpaca Markets",
                "configured": alpaca.is_configured(),
                "feed": "iex",
            },
            {
                "name": "FinRL gRPC",
                "configured": !finrl_endpoint.is_empty(),
                "endpoint": finrl_endpoint,
            },
            {
                "name": "Redis",
                "configured": !redis_url.is_empty(),
            },
        ]
    }))
}

/// Start a training job via the Python FinRL service
async fn training_start(
    body: web::Json<serde_json::Value>,
) -> actix_web::HttpResponse {
    let finrl_endpoint = std::env::var("FINRL_GRPC_ENDPOINT")
        .unwrap_or_else(|_| "http://finrl-service:50051".to_string());
    let train_url = finrl_endpoint.replace("50051", "50052");

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/train", train_url))
        .json(&body.into_inner())
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => {
            let data = r.json::<serde_json::Value>().await.unwrap_or_default();
            actix_web::HttpResponse::Ok().json(data)
        }
        Ok(r) => {
            let status = r.status();
            let body = r.text().await.unwrap_or_default();
            actix_web::HttpResponse::BadGateway().json(serde_json::json!({
                "error": format!("training service returned {}: {}", status, body)
            }))
        }
        Err(e) => {
            actix_web::HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "error": format!("training service unreachable: {}", e)
            }))
        }
    }
}

/// Get training status from the Python service
async fn training_status() -> actix_web::HttpResponse {
    let finrl_endpoint = std::env::var("FINRL_GRPC_ENDPOINT")
        .unwrap_or_else(|_| "http://finrl-service:50051".to_string());
    let train_url = finrl_endpoint.replace("50051", "50052");

    let client = reqwest::Client::new();
    let resp = client.get(format!("{}/status", train_url)).send().await;

    match resp {
        Ok(r) if r.status().is_success() => {
            let data = r.json::<serde_json::Value>().await.unwrap_or_default();
            actix_web::HttpResponse::Ok().json(data)
        }
        _ => {
            actix_web::HttpResponse::Ok().json(serde_json::json!({
                "status": "idle",
                "message": "No training job running"
            }))
        }
    }
}

/// Get data summary for training (symbols and date ranges from market_bars)
async fn training_data_summary(
    pool: web::Data<sqlx::PgPool>,
) -> actix_web::HttpResponse {
    let symbols = sqlx::query_as::<_, (String, i64, Option<chrono::DateTime<chrono::Utc>>, Option<chrono::DateTime<chrono::Utc>>)>(
        r#"SELECT symbol, COUNT(*) as bar_count, MIN(ts) as earliest, MAX(ts) as latest
           FROM market_bars WHERE timeframe = '1Day'
           GROUP BY symbol ORDER BY symbol"#,
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let data: Vec<_> = symbols.iter().map(|(sym, count, earliest, latest)| {
        serde_json::json!({
            "symbol": sym,
            "bar_count": count,
            "earliest": earliest,
            "latest": latest,
        })
    }).collect();

    actix_web::HttpResponse::Ok().json(serde_json::json!({
        "symbols": data,
    }))
}

