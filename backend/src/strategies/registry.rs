use sqlx::PgPool;

use super::*;
use dual_momentum::DualMomentumRotation;
use risk_parity_rotation::RiskParityRotation;
use trend_breakout::TrendBreakout;
use finrl_grpc::FinRLGrpcStrategy;

/// Returns every compiled strategy.
pub fn all() -> Vec<Box<dyn TradingStrategy>> {
    vec![
        Box::new(DualMomentumRotation::new()),
        Box::new(TrendBreakout::new()),
        Box::new(RiskParityRotation::new()),
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
    let strategies = all();
    let active_code_keys: Vec<&str> = strategies.iter().map(|s| s.meta().code_key).collect();

    for strategy in strategies {
        let meta = strategy.meta();
        sqlx::query(
            r#"
            INSERT INTO strategies
                (id, code_key, name, strategy_type, asset_class, status, is_active, retired_at, description, parameters, created_at, updated_at)
            VALUES
                (gen_random_uuid(), $1, $2, $3, $4, 'idle', TRUE, NULL, $5, $6::jsonb, NOW(), NOW())
            ON CONFLICT (code_key) DO UPDATE SET
                name        = EXCLUDED.name,
                description = EXCLUDED.description,
                parameters  = EXCLUDED.parameters,
                status      = CASE
                                WHEN strategies.is_active = TRUE THEN 'idle'
                                ELSE strategies.status
                              END,
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

        // Retire strategies no longer compiled so UI/API exclude them by default
        // while historical benchmark runs remain queryable.
    sqlx::query(
        r#"
        UPDATE strategies
                SET is_active = FALSE,
                        status = 'retired',
                        retired_at = COALESCE(retired_at, NOW()),
                        updated_at = NOW()
        WHERE code_key IS NOT NULL
          AND code_key <> ALL($1)
                    AND is_active = TRUE
          AND status <> 'running'
        "#,
    )
    .bind(&active_code_keys)
    .execute(pool)
    .await?;

    Ok(())
}
