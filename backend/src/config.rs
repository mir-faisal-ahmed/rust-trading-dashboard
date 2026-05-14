/// Application configuration loaded from environment variables.
pub struct AppConfig {
    pub database_url: String,
    pub host: String,
    pub port: u16,
    pub workers: usize,
    pub db_max_connections: u32,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://stratbench:stratbench@localhost:5432/stratbench".to_string()),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
            workers: std::env::var("WORKERS")
                .ok()
                .and_then(|w| w.parse().ok())
                .unwrap_or_else(|| num_cpus::get()),
            db_max_connections: std::env::var("DB_MAX_CONNECTIONS")
                .ok()
                .and_then(|c| c.parse().ok())
                .unwrap_or(20),
        }
    }
}
