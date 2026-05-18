use sqlx::PgPool;

use super::*;
use xgboost_classifier::XGBoostClassifier;
use rl_market_maker::RLMarketMaker;
use finrl_grpc::FinRLGrpcStrategy;

/// Returns every compiled strategy.
pub fn all() -> Vec<Box<dyn TradingStrategy>> {
    vec![
        Box::new(XGBoostClassifier::new()),
        Box::new(RLMarketMaker::new()),
        Box::new(FinRLGrpcStrategy::ppo()),
        Box::new(FinRLGrpcStrategy::sac()),
        Box::new(FinRLGrpcStrategy::a2c()),
        Box::new(FinRLGrpcStrategy::td3()),
    ]
}

/// Look up a strategy implementation by its code_key.
pub fn get(code_key: &str) -> Option<Box<dyn TradingStrategy>> {
    all().into_iter().find(|s| s.meta().code_key == code_key)
}

/// Upsert all compiled strategies into the database at startup.
pub async fn register_all(pool: &PgPool) -> Result<(), sqlx::Error> {
    for strategy in all() {
        let meta = strategy.meta();
        sqlx::query(
            r#"
            INSERT INTO strategies
                (id, code_key, name, strategy_type, asset_class, status, description, parameters, created_at, updated_at)
            VALUES
                (gen_random_uuid(), $1, $2, $3, $4, 'idle', $5, $6::jsonb, NOW(), NOW())
            ON CONFLICT (code_key) DO UPDATE SET
                name        = EXCLUDED.name,
                description = EXCLUDED.description,
                parameters  = EXCLUDED.parameters,
                updated_at  = NOW()
            "#,
        )
        .bind(meta.code_key)
        .bind(meta.name)
        .bind(meta.strategy_type)
        .bind(meta.asset_class)
        .bind(meta.description)
        .bind(&meta.default_parameters)
        .execute(pool)
        .await?;

        tracing::info!("registered strategy '{}' ({})", meta.name, meta.code_key);
    }
    Ok(())
}
