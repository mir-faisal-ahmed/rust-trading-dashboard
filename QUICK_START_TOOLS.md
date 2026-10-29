# Quick Start Guide - Compartmentalized Tools

## 🎯 Running Tools Standalone vs Integrated

### Standalone Execution

Each tool has a **CLI runner** for independent testing and debugging:

```bash
# Terminal 1: Strategies CLI
cd backend
cargo run --bin strategies_cli -- list

# Terminal 2: Tuning CLI (in separate shell)
cargo run --bin tuning_cli -- list-jobs --strategy-id <uuid>

# Terminal 3: Benchmarking CLI
cargo run --bin benchmarking_cli -- run --strategy-id <uuid> --start 2024-01-01 --end 2024-12-31

# Terminal 4: Paper Trading CLI
cargo run --bin paper_trading_cli -- account
```

Each tool runs **independently** with its own database connection and state management.

### Integrated Execution (Full Dashboard)

Run all tools together via Docker Compose:

```bash
# From project root
docker-compose up

# Browser: http://localhost:3000
# All tools available in sidebar navigation
```

Or run services individually:

```bash
# Terminal 1: Backend
cd backend && cargo run

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: FinRL (optional, for RL strategies)
cd python && python3 services/finrl_server.py
```

## 📦 Tool-by-Tool Testing

### Test Strategies Tool

**Standalone**:
```bash
# Create strategy
cargo run --bin strategies_cli -- create \
  --name "Test Strat" \
  --type dual_momentum \
  --asset-class equity \
  --params '{}'

# List
cargo run --bin strategies_cli -- list

# Unit tests
cargo test -p stratbench strategies
```

**In UI**:
- Navigate to Strategies (F1)
- Click "Create Strategy"
- Fill form and submit
- Strategy appears in list

### Test Tuning Tool

**Standalone**:
```bash
# Create tuning job
cargo run --bin tuning_cli -- create-job \
  --strategy-id <strategy-uuid> \
  --mode llm \
  --objective sharpe_ratio \
  --models "td3_v1,ppo_v1"

# List jobs
cargo run --bin tuning_cli -- list-jobs --strategy-id <strategy-uuid>

# Show leaderboard
cargo run --bin tuning_cli -- leaderboard --strategy-id <strategy-uuid>

# Unit tests
cargo test -p stratbench tuning
```

**In UI**:
- Strategies view → Tuning Controls
- Fill parameter grid, models, dates
- Click "LLM Tune"
- Job appears in Tuning Leaderboard

### Test Benchmarking Tool

**Standalone**:
```bash
# Run benchmark
cargo run --bin benchmarking_cli -- run \
  --strategy-id <uuid> \
  --start 2024-01-01 \
  --end 2024-12-31 \
  --initial-capital 100000

# Check results
cargo run --bin benchmarking_cli -- results --run-id <run-uuid>

# Export equity curve
cargo run --bin benchmarking_cli -- export-equity --run-id <run-uuid> > equity.csv

# Unit tests
cargo test -p stratbench benchmarking
```

**In UI**:
- Navigate to Benchmarking (F3)
- Select strategy, date range
- Click "Run Benchmark"
- Results auto-refresh with charts

### Test Paper Trading Tool

**Standalone**:
```bash
# Check account
cargo run --bin paper_trading_cli -- account

# Submit order
cargo run --bin paper_trading_cli -- submit-order \
  --symbol AAPL \
  --side buy \
  --qty 10

# View positions
cargo run --bin paper_trading_cli -- positions

# Unit tests
cargo test -p stratbench paper_trading
```

**In UI**:
- Navigate to Paper Trading (F4)
- Submit orders in form
- Monitor account and positions
- Close positions as needed

### Test Market Data Tool

**Standalone**:
```bash
# Check status
cargo run --bin market_data_cli -- status

# Fetch data
cargo run --bin market_data_cli -- fetch \
  --symbol AAPL \
  --start 2024-01-01 \
  --end 2024-12-31

# Get bars
cargo run --bin market_data_cli -- get-bars --symbol AAPL --limit 50

# Unit tests
cargo test -p stratbench market_data
```

**In UI**:
- Navigate to Market Data (F5)
- Select symbol and date range
- Click "Fetch Data"
- Chart displays fetched bars

### Test FinRL Integration

**Standalone**:
```bash
# Check health
cargo run --bin finrl_cli -- health

# Load model
cargo run --bin finrl_cli -- load-model --model-id td3_v1

# Make prediction
cargo run --bin finrl_cli -- predict --model-id td3_v1 \
  --features "[1.02, 0.45, 0.012, ...]"

# Unit tests (runtime resilience)
cargo test -p stratbench finrl_integration
```

**In UI**:
- Uses FinRL strategies (PPO, SAC, A2C, TD3)
- Strategies View → Select FinRL strategy
- Run benchmark
- Behind-the-scenes: fetches predictions, handles failures gracefully

## 🔍 Debugging Individual Tools

### Check Backend Tool Health

```bash
# Strategies
curl http://localhost:8080/api/v1/strategies | jq .

# Tuning
curl http://localhost:8080/api/v1/strategies/<id>/tuning-jobs | jq .

# Benchmarks
curl http://localhost:8080/api/v1/benchmarks/full | jq .

# Paper Trading
curl http://localhost:8080/api/v1/trading/account | jq .

# Market Data
curl http://localhost:8080/api/v1/market-data/status | jq .
```

### Check Frontend Tool Logs

```bash
# In browser DevTools (F12)
# Console tab shows React component errors
# Network tab shows API calls to each tool

# Or run with detailed logging
RUST_LOG=debug npm run dev
```

### Database Queries (Direct Tool Testing)

```bash
# Connect to PostgreSQL
psql -h localhost -U postgres -d stratbench

# Check strategies
SELECT id, name, status FROM strategies LIMIT 5;

# Check tuning jobs
SELECT id, strategy_id, mode, status FROM strategy_tuning_jobs LIMIT 5;

# Check benchmark runs
SELECT id, strategy_id, status FROM benchmark_runs LIMIT 5;

# Check paper trading orders
SELECT id, symbol, side, status FROM paper_trading_orders LIMIT 5;

# Check market bars
SELECT COUNT(*), symbol FROM market_bars GROUP BY symbol;
```

## 🚀 Integration Testing Scenarios

### Scenario 1: Full Workflow
```bash
# 1. Create strategy
STRAT_ID=$(cargo run --bin strategies_cli -- create ... | jq -r .id)

# 2. Fetch market data
cargo run --bin market_data_cli -- fetch --symbol AAPL --start 2024-01-01 --end 2024-12-31

# 3. Run benchmark
RUN_ID=$(cargo run --bin benchmarking_cli -- run --strategy-id $STRAT_ID | jq -r .id)

# 4. View results
cargo run --bin benchmarking_cli -- results --run-id $RUN_ID

# 5. Simulate in paper trading
cargo run --bin paper_trading_cli -- submit-order --symbol AAPL --side buy --qty 10

# All in Docker:
docker-compose up
# Use UI to execute same workflow
```

### Scenario 2: Tuning Workflow
```bash
# 1. Create strategy
STRAT_ID=<uuid>

# 2. Create tuning job
JOB_ID=$(cargo run --bin tuning_cli -- create-job \
  --strategy-id $STRAT_ID \
  --mode llm \
  --objective sharpe_ratio \
  --models "td3_v1,ppo_v1" | jq -r .id)

# 3. View job
cargo run --bin tuning_cli -- show-job --id $JOB_ID

# 4. When complete, run benchmark with tuned params
cargo run --bin benchmarking_cli -- run --strategy-id $STRAT_ID

# 5. Check leaderboard
cargo run --bin tuning_cli -- leaderboard --strategy-id $STRAT_ID
```

## 📊 Performance Testing

### Benchmark Tool Performance
```bash
# Time a backtest run
time cargo run --bin benchmarking_cli -- run \
  --strategy-id <uuid> \
  --start 2024-01-01 \
  --end 2024-12-31

# Typical: 2-5 seconds for 1 year daily bars
```

### Tool Latency
```bash
# Strategies list latency
time curl http://localhost:8080/api/v1/strategies > /dev/null

# Typical: < 100ms

# Market data fetch latency
time cargo run --bin market_data_cli -- fetch ... > /dev/null

# Typical: 1-3 seconds depending on API
```

## 🧹 Cleanup & Reset

### Reset Individual Tools

```bash
# Clear paper trading (reset account)
cargo run --bin paper_trading_cli -- reset --capital 100000

# Clear cache (market data)
cargo run --bin market_data_cli -- clear-cache --symbol AAPL

# Archive old tuning jobs
cargo run --bin tuning_cli -- retire --id <job-uuid>
```

### Full Reset

```bash
# Docker: Reset database
docker-compose down -v
docker-compose up

# Or manually:
# 1. Drop & recreate PostgreSQL
# 2. Re-run migrations
# 3. Restart backend/frontend
```

## 📚 Tool README Index

Quick links to full documentation:

| Tool | Backend Docs | Frontend Docs |
|------|--------------|---------------|
| Strategies | [backend/src/tools/strategies/README.md](../../backend/src/tools/strategies/README.md) | [frontend/src/tools/strategies/README.md](../../frontend/src/tools/strategies/README.md) |
| Tuning | [backend/src/tools/tuning/README.md](../../backend/src/tools/tuning/README.md) | [frontend/src/tools/tuning/README.md](../../frontend/src/tools/tuning/README.md) |
| Benchmarking | [backend/src/tools/benchmarking/README.md](../../backend/src/tools/benchmarking/README.md) | [frontend/src/tools/benchmarking/README.md](../../frontend/src/tools/benchmarking/README.md) |
| Paper Trading | [backend/src/tools/paper_trading/README.md](../../backend/src/tools/paper_trading/README.md) | [frontend/src/tools/paper_trading/README.md](../../frontend/src/tools/paper_trading/README.md) |
| Market Data | [backend/src/tools/market_data/README.md](../../backend/src/tools/market_data/README.md) | [frontend/src/tools/market_data/README.md](../../frontend/src/tools/market_data/README.md) |
| FinRL | [backend/src/tools/finrl_integration/README.md](../../backend/src/tools/finrl_integration/README.md) | (integrated in strategies) |

## ✅ Health Check Script

```bash
#!/bin/bash
# health_check.sh - Check all tools

echo "=== Strategies Tool ==="
cargo run --bin strategies_cli -- list | wc -l

echo "=== Market Data Tool ==="
cargo run --bin market_data_cli -- status | grep -c "account_status"

echo "=== Paper Trading Tool ==="
cargo run --bin paper_trading_cli -- account | grep -c "total_equity"

echo "✅ All tools operational"
```

Run with:
```bash
chmod +x health_check.sh
./health_check.sh
```

