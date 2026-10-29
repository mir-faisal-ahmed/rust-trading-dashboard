# Market Data Tool

Self-contained module for historical and real-time market data fetching, caching, and management.

## Overview

The Market Data Tool handles all data sourcing for backtests and live trading. It provides:

- **Data Fetching**: Historical OHLCV bars from Alpaca API
- **Caching**: Local storage to minimize API calls
- **Status Tracking**: Account limits, data freshness, available symbols
- **Multiple Timeframes**: 1min, 5min, 15min, 1hour, 1day

## Standalone CLI Usage

```bash
# Check data service status
cargo run --bin market_data_cli -- status

# Fetch historical bars
cargo run --bin market_data_cli -- fetch \
  --symbol AAPL \
  --start 2024-01-01 \
  --end 2024-12-31 \
  --timeframe 1day

# Get bars (from cache or API)
cargo run --bin market_data_cli -- get-bars \
  --symbol AAPL \
  --timeframe 1day \
  --limit 100

# Get bars with date range
cargo run --bin market_data_cli -- get-bars \
  --symbol AAPL \
  --start 2024-06-01 \
  --end 2024-12-31

# List cached symbols
cargo run --bin market_data_cli -- list-cached

# Export bars as CSV
cargo run --bin market_data_cli -- export \
  --symbol AAPL \
  --start 2024-01-01 \
  --end 2024-12-31 \
  --format csv \
  > aapl.csv

# Clear cache for symbol
cargo run --bin market_data_cli -- clear-cache --symbol AAPL

# Update cache for multiple symbols
cargo run --bin market_data_cli -- sync \
  --symbols AAPL,MSFT,GOOGL,TSLA \
  --days-back 252
```

## API Integration

All endpoints prefixed with `/api/v1/market-data`:

```bash
# GET /market-data/status
curl http://localhost:8080/api/v1/market-data/status

# POST /market-data/fetch
curl -X POST http://localhost:8080/api/v1/market-data/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "timeframe": "1day",
    "start": "2024-01-01",
    "end": "2024-12-31"
  }'

# GET /market-data/{symbol}
curl "http://localhost:8080/api/v1/market-data/AAPL?timeframe=1day&limit=100"

# GET /market-data/{symbol} with date range
curl "http://localhost:8080/api/v1/market-data/AAPL?timeframe=1day&start=2024-01-01&end=2024-12-31"
```

## File Structure

```
backend/src/tools/market_data/
├── mod.rs              # Module exports
├── core.rs             # Type definitions
├── service.rs          # MarketDataService trait
├── alpaca_client.rs    # Alpaca API integration
├── cli.rs              # Standalone CLI
├── tests.rs            # Unit & integration tests
└── README.md           # This file
```

## Core Types

```rust
pub struct BarData {
    pub timestamp: DateTime<Utc>,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

pub struct MarketDataStatus {
    pub account_status: String,           // active, inactive
    pub data_available: bool,
    pub last_update: DateTime<Utc>,
    pub cached_symbols: Vec<String>,
    pub api_requests_today: u32,
    pub api_limit: u32,
    pub next_reset: DateTime<Utc>,
}

pub struct FetchRequest {
    pub symbol: String,
    pub timeframe: String,  // 1min, 5min, 15min, 1hour, 1day
    pub start: NaiveDate,
    pub end: NaiveDate,
    pub crypto: Option<bool>,
}
```

## Timeframes

| Timeframe | Use Case |
|-----------|----------|
| 1min      | Intraday scalping, high-frequency analysis |
| 5min      | Short-term strategies, day trading |
| 15min     | Swing trading, technical analysis |
| 1hour     | Multi-timeframe analysis |
| 1day      | Long-term investing, strategic backtests |

## Caching Strategy

- **Location**: Database + filesystem cache
- **TTL**: Unlimited (bars are immutable after close)
- **Invalidation**: Manual via `clear-cache` command
- **Sync**: Background updates available via `sync` command

### Cache Hierarchy
1. **Memory Cache**: Fastest; limited size
2. **Database**: Persistent; available across restarts
3. **Alpaca API**: Slowest; rate-limited

## Data Sources

### Equity Markets
- **Source**: Alpaca API (via REST)
- **Coverage**: 10,000+ US stocks, ETFs
- **Quality**: OPRA real-time (needs subscription)
- **History**: Up to ~20 years

### Crypto (Optional)
- **Source**: Alpaca Crypto (if enabled)
- **Coverage**: Major pairs (BTC, ETH, etc.)
- **Quality**: Varies by exchange
- **History**: Limited (often < 5 years)

## Testing

```bash
# Run all market data tests
cargo test -p stratbench market_data

# Test Alpaca client
cargo test -p stratbench market_data::alpaca_client::tests

# Test caching logic
cargo test -p stratbench market_data::core::tests

# With output
cargo test -p stratbench market_data -- --nocapture
```

## Common Patterns

### Bulk Fetch Multiple Symbols
```bash
for symbol in AAPL MSFT GOOGL TSLA; do
  echo "Fetching $symbol..."
  cargo run --bin market_data_cli -- fetch \
    --symbol $symbol \
    --start 2024-01-01 \
    --end 2024-12-31
done
```

### Create CSV for Analysis
```bash
# Export multiple symbols
for symbol in AAPL MSFT; do
  cargo run --bin market_data_cli -- export \
    --symbol $symbol \
    --format csv \
    > ${symbol}.csv
done

# Combine
(head -1 AAPL.csv; tail -n +2 *.csv) > combined.csv
```

### Check Data Quality
```bash
# Export and analyze
cargo run --bin market_data_cli -- export --symbol AAPL --format json | \
  jq 'group_by(.timestamp | split("T")[0]) | map(length)' | \
  sort | uniq -c  # Check bars per day
```

### Monitor API Usage
```bash
watch -n 5 'cargo run --bin market_data_cli -- status | grep -E "requests|limit"'
```

## Integration with Other Tools

### Fetch Data Before Benchmark
```bash
# 1. Ensure data is cached
cargo run --bin market_data_cli -- fetch \
  --symbol AAPL \
  --start 2024-01-01 \
  --end 2024-12-31

# 2. Run benchmark
cargo run --bin benchmarking_cli -- run \
  --strategy-id <uuid> \
  --start 2024-01-01 \
  --end 2024-12-31
```

### Pre-populate Cache for Multiple Symbols
```bash
SYMBOLS="AAPL MSFT GOOGL TSLA AMZN"
cargo run --bin market_data_cli -- sync \
  --symbols ${SYMBOLS// /,} \
  --days-back 252
```

## Performance Considerations

- **API Rate Limits**: Alpaca allows ~200 requests/minute (check status)
- **Data Size**: ~1 year of daily data = ~100 bytes/symbol
- **Query Speed**: Database lookups O(log n); typically < 100ms
- **Bulk Operations**: Parallel fetches recommended for multiple symbols

## Environment Variables

```bash
# Alpaca API credentials
export APCA_API_BASE_URL="https://api.alpaca.markets"
export APCA_API_KEY_ID="your-key"
export APCA_API_SECRET_KEY="your-secret"

# Cache configuration
export MARKET_DATA_CACHE_DIR="/var/lib/market_data"
export MARKET_DATA_CACHE_MAX_SIZE="10GB"
```

## Debugging

### View Cache Contents
```bash
# List all cached symbols
cargo run --bin market_data_cli -- list-cached

# Show cache size
du -sh ${MARKET_DATA_CACHE_DIR:-/var/lib/market_data}
```

### Check API Connectivity
```bash
cargo run --bin market_data_cli -- status
```

### Export Diagnostic Data
```bash
cargo run --bin market_data_cli -- export \
  --symbol AAPL \
  --format json | \
  jq 'map(select(.open != .close)) | length'  # Count non-doji bars
```

## Known Limitations

- **Extended Hours**: Pre/post-market data available for equities only
- **Splits/Dividends**: Raw prices; not split-adjusted
- **Delisted Symbols**: May disappear from cache; export before delisting
- **Crypto Gaps**: Crypto runs 24/7; weekend data may be sparse

