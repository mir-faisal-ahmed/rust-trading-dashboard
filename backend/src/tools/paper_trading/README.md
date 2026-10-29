# Paper Trading Tool

Self-contained module for simulated trading engine managing account, positions, and orders.

## Overview

The Paper Trading Tool provides a risk-free trading simulator for strategy testing and portfolio management. It tracks:

- **Account**: Cash balance, total equity, buying power
- **Positions**: Current holdings with entry prices and P&L
- **Orders**: Order history with execution details
- **Portfolio History**: Daily/intraday equity snapshots

## Standalone CLI Usage

```bash
# Check account status
cargo run --bin paper_trading_cli -- account

# List open positions
cargo run --bin paper_trading_cli -- positions

# Submit a buy order
cargo run --bin paper_trading_cli -- submit-order \
  --symbol AAPL \
  --side buy \
  --qty 10 \
  --price 150.00 \
  --order-type limit

# Submit a market order
cargo run --bin paper_trading_cli -- submit-order \
  --symbol MSFT \
  --side sell \
  --qty 5 \
  --order-type market

# List orders
cargo run --bin paper_trading_cli -- orders --status open

# Cancel order
cargo run --bin paper_trading_cli -- cancel-order --order-id <uuid>

# Close position
cargo run --bin paper_trading_cli -- close-position --symbol AAPL --qty 5

# Close all positions
cargo run --bin paper_trading_cli -- close-all

# Get portfolio history
cargo run --bin paper_trading_cli -- portfolio-history --period 1mo

# Reset account
cargo run --bin paper_trading_cli -- reset --capital 100000
```

## API Integration

All endpoints prefixed with `/api/v1/trading`:

```bash
# GET /trading/account
curl http://localhost:8080/api/v1/trading/account

# GET /trading/positions
curl http://localhost:8080/api/v1/trading/positions

# POST /trading/orders
curl -X POST http://localhost:8080/api/v1/trading/orders \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "side": "buy",
    "qty": "10",
    "type": "market"
  }'

# GET /trading/orders
curl http://localhost:8080/api/v1/trading/orders?status=open

# DELETE /trading/orders/{id}
curl -X DELETE http://localhost:8080/api/v1/trading/orders/550e8400-e29b-41d4-a716-446655440000

# DELETE /trading/positions/{symbol}
curl -X DELETE http://localhost:8080/api/v1/trading/positions/AAPL

# DELETE /trading/positions (close all)
curl -X DELETE http://localhost:8080/api/v1/trading/positions

# GET /trading/portfolio-history
curl http://localhost:8080/api/v1/trading/portfolio-history?period=1mo&timeframe=1d
```

## File Structure

```
backend/src/tools/paper_trading/
├── mod.rs              # Module exports
├── core.rs             # Type definitions
├── engine.rs           # Trading engine logic
├── service.rs          # PaperTradingService trait
├── cli.rs              # Standalone CLI
├── tests.rs            # Unit & integration tests
└── README.md           # This file
```

## Core Types

```rust
pub struct PaperAccount {
    pub cash: f64,
    pub total_equity: f64,
    pub buying_power: f64,
    pub portfolio_value: f64,
    pub created_at: DateTime<Utc>,
}

pub struct PaperPosition {
    pub symbol: String,
    pub qty: f64,
    pub entry_price: f64,
    pub current_price: f64,
    pub market_value: f64,
    pub pnl: f64,
    pub pnl_pct: f64,
    pub created_at: DateTime<Utc>,
}

pub struct OrderRequest {
    pub symbol: String,
    pub side: OrderSide,       // buy, sell
    pub qty: String,
    pub order_type: OrderType, // market, limit
    pub limit_price: Option<f64>,
}

pub struct PaperOrder {
    pub id: Uuid,
    pub symbol: String,
    pub side: String,
    pub qty: f64,
    pub filled_qty: f64,
    pub status: String,         // pending, filled, rejected, cancelled
    pub order_type: String,
    pub limit_price: Option<f64>,
    pub fill_price: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub filled_at: Option<DateTime<Utc>>,
}
```

## Order Types

### Market Orders
Immediately fill at current market price:
```bash
cargo run --bin paper_trading_cli -- submit-order \
  --symbol AAPL \
  --side buy \
  --qty 10 \
  --order-type market
```

### Limit Orders
Fill only if price is at or better than specified:
```bash
cargo run --bin paper_trading_cli -- submit-order \
  --symbol AAPL \
  --side buy \
  --qty 10 \
  --price 150.00 \
  --order-type limit
```

Limit buy: Fills if price ≤ limit
Limit sell: Fills if price ≥ limit

## Position Management

### Open Position
```bash
# Buy 10 shares
cargo run --bin paper_trading_cli -- submit-order \
  --symbol AAPL \
  --side buy \
  --qty 10
```

### Partial Close
```bash
# Sell 5 of 10 shares
cargo run --bin paper_trading_cli -- close-position --symbol AAPL --qty 5
```

### Full Close
```bash
# Sell all shares
cargo run --bin paper_trading_cli -- close-position --symbol AAPL
# OR
cargo run --bin paper_trading_cli -- close-all
```

## Account Dynamics

### Buying Power
```
Buying Power = Cash × Margin Multiplier
```
For margin accounts, typical multiplier is 2x (4x intraday).

### Position P&L
```
Unrealized P&L = (Current Price - Entry Price) × Qty
Unrealized P&L % = (Current Price / Entry Price - 1) × 100
```

### Account Equity
```
Total Equity = Cash + Sum(Position Values)
```

## Testing

```bash
# Run all paper trading tests
cargo test -p stratbench paper_trading

# Test order execution
cargo test -p stratbench paper_trading::engine::tests

# Test position management
cargo test -p stratbench paper_trading::core::tests

# With output
cargo test -p stratbench paper_trading -- --nocapture
```

## Common Patterns

### Rebalance Portfolio
```bash
# Close all
cargo run --bin paper_trading_cli -- close-all

# New allocation
cargo run --bin paper_trading_cli -- submit-order --symbol AAPL --side buy --qty 100
cargo run --bin paper_trading_cli -- submit-order --symbol MSFT --side buy --qty 50
```

### Track Daily Performance
```bash
# Get current equity
EQUITY=$(cargo run --bin paper_trading_cli -- account | jq .total_equity)

# Store time-series
echo "$(date): $EQUITY" >> equity.log
```

### Risk Management - Position Size
```bash
# Get account equity
EQUITY=$(cargo run --bin paper_trading_cli -- account | jq .total_equity)

# Risk 1% per trade = $1000 on $100k account
RISK=$(echo "$EQUITY * 0.01" | bc)

# Calculate shares = risk / stop_loss_pct
SHARES=$(echo "$RISK / 0.02" | bc)  # 2% stop loss

# Place order
cargo run --bin paper_trading_cli -- submit-order \
  --symbol AAPL \
  --side buy \
  --qty $SHARES
```

## Integration with Other Tools

### Simulate Benchmark Strategy in Paper Trading
```bash
# 1. Get benchmark results
TRADES=$(cargo run --bin benchmarking_cli -- export-trades --run-id <uuid>)

# 2. Replay trades in paper trading
while read line; do
  SYMBOL=$(echo $line | jq .symbol)
  SIDE=$(echo $line | jq .side)
  QTY=$(echo $line | jq .quantity)
  
  cargo run --bin paper_trading_cli -- submit-order \
    --symbol $SYMBOL \
    --side $SIDE \
    --qty $QTY
done < <(echo "$TRADES" | jq -c '.[]')
```

### Monitor During Live Execution
```bash
# Check account frequently
while true; do
  clear
  cargo run --bin paper_trading_cli -- account
  cargo run --bin paper_trading_cli -- positions
  sleep 1
done
```

## Performance Considerations

- **Order Execution**: Immediate for market orders, conditional for limit orders
- **Price Updates**: Uses current market price; update frequency depends on data source
- **Slippage**: Not modeled in paper trading; see `benchmarking_cli` for slippage simulation
- **Commissions**: Configurable; typically 0.1% or flat per order

## Debugging

### View All Orders
```bash
cargo run --bin paper_trading_cli -- orders --status all
```

### Export Account History
```bash
cargo run --bin paper_trading_cli -- portfolio-history --period ytd --format json > history.json
```

### Reset to Clean State
```bash
cargo run --bin paper_trading_cli -- reset --capital 100000
```

