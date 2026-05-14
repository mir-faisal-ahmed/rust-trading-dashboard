-- Initial schema for StratBench trading strategy benchmarking system.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE strategies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    strategy_type   VARCHAR(100) NOT NULL,
    asset_class     VARCHAR(50) NOT NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'idle',
    description     TEXT NOT NULL DEFAULT '',
    parameters      JSONB NOT NULL DEFAULT '{}',
    code_key        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT strategies_code_key_unique UNIQUE (code_key)
);

CREATE INDEX idx_strategies_type ON strategies(strategy_type);
CREATE INDEX idx_strategies_status ON strategies(status);

CREATE TABLE benchmark_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id     UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'queued',
    duration_ms     BIGINT,
    initial_capital DOUBLE PRECISION NOT NULL DEFAULT 100000.0,
    commission_bps  DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    slippage_bps    DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_benchmark_runs_strategy ON benchmark_runs(strategy_id);
CREATE INDEX idx_benchmark_runs_status ON benchmark_runs(status);
CREATE INDEX idx_benchmark_runs_started ON benchmark_runs(started_at DESC);

CREATE TABLE performance_metrics (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    benchmark_run_id            UUID NOT NULL UNIQUE REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    total_return_pct            DOUBLE PRECISION NOT NULL,
    annualized_return_pct       DOUBLE PRECISION NOT NULL,
    sharpe_ratio                DOUBLE PRECISION NOT NULL,
    sortino_ratio               DOUBLE PRECISION NOT NULL,
    calmar_ratio                DOUBLE PRECISION NOT NULL,
    max_drawdown_pct            DOUBLE PRECISION NOT NULL,
    max_drawdown_duration_days  INTEGER NOT NULL,
    volatility_ann_pct          DOUBLE PRECISION NOT NULL,
    win_rate_pct                DOUBLE PRECISION NOT NULL,
    profit_factor               DOUBLE PRECISION NOT NULL,
    total_trades                INTEGER NOT NULL,
    avg_trade_return_pct        DOUBLE PRECISION NOT NULL,
    avg_win_pct                 DOUBLE PRECISION NOT NULL,
    avg_loss_pct                DOUBLE PRECISION NOT NULL,
    expectancy                  DOUBLE PRECISION NOT NULL,
    avg_holding_period_hours    DOUBLE PRECISION NOT NULL,
    skewness                    DOUBLE PRECISION NOT NULL,
    kurtosis                    DOUBLE PRECISION NOT NULL,
    var_95_pct                  DOUBLE PRECISION NOT NULL,
    cvar_95_pct                 DOUBLE PRECISION NOT NULL,
    beta                        DOUBLE PRECISION NOT NULL,
    alpha_ann_pct               DOUBLE PRECISION NOT NULL,
    information_ratio           DOUBLE PRECISION NOT NULL,
    treynor_ratio               DOUBLE PRECISION NOT NULL,
    omega_ratio                 DOUBLE PRECISION NOT NULL,
    tail_ratio                  DOUBLE PRECISION NOT NULL
);

CREATE INDEX idx_metrics_run ON performance_metrics(benchmark_run_id);

CREATE TABLE trades (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    benchmark_run_id    UUID NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    strategy_id         UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    symbol              VARCHAR(50) NOT NULL,
    side                VARCHAR(10) NOT NULL,
    entry_price         DOUBLE PRECISION NOT NULL,
    exit_price          DOUBLE PRECISION NOT NULL,
    quantity            DOUBLE PRECISION NOT NULL,
    entry_time          TIMESTAMPTZ NOT NULL,
    exit_time           TIMESTAMPTZ NOT NULL,
    pnl                 DOUBLE PRECISION NOT NULL,
    pnl_pct             DOUBLE PRECISION NOT NULL,
    fees                DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    slippage            DOUBLE PRECISION NOT NULL DEFAULT 0.0
);

CREATE INDEX idx_trades_run ON trades(benchmark_run_id);
CREATE INDEX idx_trades_strategy ON trades(strategy_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_entry_time ON trades(entry_time DESC);

CREATE TABLE equity_snapshots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    benchmark_run_id    UUID NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    timestamp           TIMESTAMPTZ NOT NULL,
    equity              DOUBLE PRECISION NOT NULL,
    benchmark_equity    DOUBLE PRECISION NOT NULL,
    drawdown_pct        DOUBLE PRECISION NOT NULL
);

CREATE INDEX idx_equity_run ON equity_snapshots(benchmark_run_id);
CREATE INDEX idx_equity_timestamp ON equity_snapshots(benchmark_run_id, timestamp ASC);

CREATE TABLE market_bars (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol      VARCHAR(20)     NOT NULL,
    timeframe   VARCHAR(10)     NOT NULL,
    ts          TIMESTAMPTZ     NOT NULL,
    open        NUMERIC(18, 6)  NOT NULL,
    high        NUMERIC(18, 6)  NOT NULL,
    low         NUMERIC(18, 6)  NOT NULL,
    close       NUMERIC(18, 6)  NOT NULL,
    volume      NUMERIC(24, 8)  NOT NULL,
    CONSTRAINT uq_market_bars UNIQUE (symbol, timeframe, ts)
);

CREATE INDEX idx_market_bars_lookup ON market_bars (symbol, timeframe, ts DESC);
