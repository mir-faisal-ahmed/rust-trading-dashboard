-- Strategy management support for dashboard editing, deletion, and tuning jobs.

ALTER TABLE strategies
    ADD COLUMN IF NOT EXISTS source_path TEXT;

CREATE INDEX IF NOT EXISTS idx_strategies_source_path ON strategies(source_path);

CREATE TABLE IF NOT EXISTS strategy_tuning_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id     UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    mode            VARCHAR(20) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'queued',
    objective       VARCHAR(100) NOT NULL DEFAULT 'sharpe_ratio',
    parameter_grid  JSONB NOT NULL DEFAULT '{}'::jsonb,
    model_hints     JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes           TEXT NOT NULL DEFAULT '',
    results         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_strategy_tuning_jobs_strategy ON strategy_tuning_jobs(strategy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_tuning_jobs_status ON strategy_tuning_jobs(status);