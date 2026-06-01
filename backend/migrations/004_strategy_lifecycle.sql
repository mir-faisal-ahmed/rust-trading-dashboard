-- Strategy lifecycle hardening for production-grade DB-driven strategy management.
-- Keeps historical benchmark/trade data while allowing safe strategy retirement.

ALTER TABLE strategies
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_strategies_active ON strategies(is_active);

-- Backfill: previously failed status was used for deprecated strategies.
-- Retire them explicitly so API/UI can consistently filter active strategies.
UPDATE strategies
SET is_active = FALSE,
    status = 'retired',
    retired_at = COALESCE(retired_at, NOW()),
    updated_at = NOW()
WHERE status = 'failed'
  AND code_key IS NOT NULL;
