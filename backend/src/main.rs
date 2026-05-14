use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;

mod api;
mod config;
mod data;
mod db;
mod engine;
mod ws;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,stratbench=debug")),
        )
        .init();

    let cfg = config::AppConfig::from_env();

    if cfg.alpaca_configured() {
        tracing::info!("alpaca credentials loaded (paper account)");
    } else {
        tracing::warn!("ALPACA_API_KEY / ALPACA_API_SECRET not set — market data fetching disabled");
    }

    tracing::info!("connecting to database at {}", cfg.database_url);

    let pool = PgPoolOptions::new()
        .max_connections(cfg.db_max_connections)
        .connect(&cfg.database_url)
        .await
        .expect("failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("failed to run database migrations");

    tracing::info!("starting server on {}:{}", cfg.host, cfg.port);

    let alpaca_client = web::Data::new(data::alpaca::AlpacaClient::new(
        cfg.alpaca_api_key.clone(),
        cfg.alpaca_api_secret.clone(),
        cfg.alpaca_data_url.clone(),
    ));
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
            .app_data(alpaca_client.clone())
            .configure(api::configure_routes)
            .route("/ws", web::get().to(ws::ws_handler))
    })
    .bind((cfg.host.as_str(), cfg.port))?
    .workers(cfg.workers)
    .run()
    .await
}
