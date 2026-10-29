-- Add reproducibility metadata for strategy tuning jobs
-- Tracks model name, parameter hash for deterministic result lookup and leaderboard generation

ALTER TABLE strategy_tuning_jobs
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS parameter_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS best_metric_value DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS backtest_date_from DATE,
    ADD COLUMN IF NOT EXISTS backtest_date_to DATE;

CREATE INDEX IF NOT EXISTS idx_strategy_tuning_jobs_model_hash ON strategy_tuning_jobs(model_name, parameter_hash);
CREATE INDEX IF NOT EXISTS idx_strategy_tuning_jobs_completed ON strategy_tuning_jobs(completed_at DESC) WHERE status = 'completed';
