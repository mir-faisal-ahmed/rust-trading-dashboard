CREATE TABLE IF NOT EXISTS sentiment_signals (
    id UUID PRIMARY KEY,
    symbol TEXT NOT NULL,
    source TEXT NOT NULL,
    source_detail TEXT NOT NULL,
    sentiment DOUBLE PRECISION NOT NULL,
    raw_sentiment DOUBLE PRECISION NOT NULL,
    volume INTEGER NOT NULL,
    freshness DOUBLE PRECISION NOT NULL,
    source_weight DOUBLE PRECISION NOT NULL,
    reason TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentiment_signals_symbol_ts
    ON sentiment_signals(symbol, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_sentiment_signals_source_ts
    ON sentiment_signals(source, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_sentiment_signals_created_at
    ON sentiment_signals(created_at DESC);
