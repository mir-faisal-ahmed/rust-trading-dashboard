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
            // /benchmarks/full must be registered before /benchmarks/{id}
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
