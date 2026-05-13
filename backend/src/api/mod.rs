pub mod strategies;
pub mod benchmarks;
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
                web::resource("/benchmarks/{id}")
                    .route(web::get().to(benchmarks::get)),
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
