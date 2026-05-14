-- Strategies are now registered from compiled code at startup.
-- Wipe seeded data and add code_key for strategy-as-code pattern.

DELETE FROM equity_snapshots;
DELETE FROM trades;
DELETE FROM performance_metrics;
DELETE FROM benchmark_runs;
DELETE FROM strategies;

ALTER TABLE strategies ADD COLUMN code_key TEXT;
ALTER TABLE strategies ADD CONSTRAINT strategies_code_key_unique UNIQUE (code_key);
