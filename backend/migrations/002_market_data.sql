CREATE TABLE IF NOT EXISTS market_bars (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol      VARCHAR(20)     NOT NULL,
    timeframe   VARCHAR(10)     NOT NULL,
    ts          TIMESTAMPTZ     NOT NULL,
    open        NUMERIC(18, 6)  NOT NULL,
    high        NUMERIC(18, 6)  NOT NULL,
    low         NUMERIC(18, 6)  NOT NULL,
    close       NUMERIC(18, 6)  NOT NULL,
    volume      BIGINT          NOT NULL,
    CONSTRAINT uq_market_bars UNIQUE (symbol, timeframe, ts)
);

CREATE INDEX IF NOT EXISTS idx_market_bars_lookup
    ON market_bars (symbol, timeframe, ts DESC);
