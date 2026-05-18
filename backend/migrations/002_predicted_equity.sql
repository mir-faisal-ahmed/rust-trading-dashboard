-- Add predicted_equity column to track model's intended portfolio value
-- alongside the actual (threshold-filtered) portfolio value.
ALTER TABLE equity_snapshots
    ADD COLUMN IF NOT EXISTS predicted_equity DOUBLE PRECISION;
