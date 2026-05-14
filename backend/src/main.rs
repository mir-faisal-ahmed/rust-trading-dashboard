use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;

mod api;
mod config;
mod db;
mod engine;
mod ws;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // load .env if present
    dotenvy::dotenv().ok();

    // initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,stratbench=debug")),
        )
        .init();

    let cfg = config::AppConfig::from_env();

    tracing::info!("connecting to database at {}", cfg.database_url);

    let pool = PgPoolOptions::new()
        .max_connections(cfg.db_max_connections)
        .connect(&cfg.database_url)
        .await
        .expect("failed to connect to database");

    // run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("failed to run database migrations");

    tracing::info!("starting server on {}:{}", cfg.host, cfg.port);

    let pool_data = web::Data::new(pool);
    let engine_state = web::Data::new(engine::EngineState::new());

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(pool_data.clone())
            .app_data(engine_state.clone())
            .configure(api::configure_routes)
            .route("/ws", web::get().to(ws::ws_handler))
    })
    .bind((cfg.host.as_str(), cfg.port))?
    .workers(cfg.workers)
    .run()
    .await
}
