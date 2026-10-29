# Backend Tools - Getting Started

This directory contains **6 compartmentalized trading tools** organized for standalone and integrated use.

## 📁 Tools Available

| Tool | Purpose | Standalone CLI | File | Docs |
|------|---------|-----------------|------|------|
| **strategies** | CRUD for trading strategies | `--bin strategies_cli` | [strategies/](strategies/) | [strategies/README.md](strategies/README.md) |
| **tuning** | Parameter optimization (manual/auto/LLM) | `--bin tuning_cli` | [tuning/](tuning/) | [tuning/README.md](tuning/README.md) |
| **benchmarking** | Backtest execution & metrics | `--bin benchmarking_cli` | [benchmarking/](benchmarking/) | [benchmarking/README.md](benchmarking/README.md) |
| **paper_trading** | Simulated trading engine | `--bin paper_trading_cli` | [paper_trading/](paper_trading/) | [paper_trading/README.md](paper_trading/README.md) |
| **market_data** | Data fetching & caching | `--bin market_data_cli` | [market_data/](market_data/) | [market_data/README.md](market_data/README.md) |
| **finrl_integration** | FinRL gRPC service integration | `--bin finrl_cli` | [finrl_integration/](finrl_integration/) | [finrl_integration/README.md](finrl_integration/README.md) |

## 🚀 Quick Start

### Run a Tool Standalone
```bash
# Example: List all strategies
cargo run --bin strategies_cli -- list

# Example: Create a tuning job
cargo run --bin tuning_cli -- create-job \
  --strategy-id <uuid> \
  --mode llm \
  --objective sharpe_ratio

# Get help for any tool
cargo run --bin [tool_name]_cli -- help
```

### Run All Tools via API
```bash
# Backend server (main.rs) provides REST API for all tools
cargo run

# In another terminal, query tools via HTTP:
curl http://localhost:8080/api/v1/strategies
curl http://localhost:8080/api/v1/benchmarks/full
curl http://localhost:8080/api/v1/trading/account
```

### Run All Tools via UI (Integrated)
```bash
# Terminal 1: Backend
cargo run

# Terminal 2: Frontend (from frontend/ directory)
npm run dev

# Open http://localhost:3000 in browser
# All tools available via sidebar navigation
```

## 📖 Documentation

- **[../../TOOLS_ARCHITECTURE.md](../../TOOLS_ARCHITECTURE.md)** - Overall architecture & tool organization
- **[../../TOOLS_INDEX.md](../../TOOLS_INDEX.md)** - Complete index and navigation guide
- **[../../QUICK_START_TOOLS.md](../../QUICK_START_TOOLS.md)** - Quick reference for standalone & integrated usage
- **Each tool has its own [tool]/README.md** with detailed docs

## 🧪 Testing

```bash
# Test all backend tools
cargo test -p stratbench

# Test specific tool
cargo test -p stratbench strategies
cargo test -p stratbench tuning
cargo test -p stratbench benchmarking
# ... etc

# Test with output
cargo test -p stratbench strategies -- --nocapture
```

## 🛠 Tool Structure

Each tool follows this pattern:

```
[tool_name]/
├── mod.rs              # Public API & module documentation
├── core.rs             # Type definitions
├── service.rs          # Business logic trait
├── cli.rs              # Standalone CLI entry point
├── tests.rs            # Unit & integration tests
└── README.md           # Complete tool documentation
```

## 🔗 Tool Dependencies

```
Strategies (root) ←─ referenced by ─→ Tuning, Benchmarking, Paper Trading
Market Data (independent) ←─────────→ Benchmarking (for backtest data)
FinRL Integration (internal) ←──────→ Benchmarking (for RL strategies)
Paper Trading (independent)
```

## 📊 Common Workflows

### 1. Run a Backtest
```bash
# 1. Create strategy
cargo run --bin strategies_cli -- create \
  --name "My Strategy" \
  --type dual_momentum \
  --asset-class equity \
  --params '{}'

# 2. Fetch data (optional - benchmarking will auto-fetch)
cargo run --bin market_data_cli -- fetch \
  --symbol AAPL --start 2024-01-01 --end 2024-12-31

# 3. Run benchmark
cargo run --bin benchmarking_cli -- run \
  --strategy-id <returned-uuid> \
  --start 2024-01-01 \
  --end 2024-12-31

# 4. View results
cargo run --bin benchmarking_cli -- results --run-id <run-uuid>
```

### 2. Tune Hyperparameters
```bash
# 1. Create tuning job
cargo run --bin tuning_cli -- create-job \
  --strategy-id <uuid> \
  --mode llm \
  --objective sharpe_ratio \
  --models "td3_v1,ppo_v1"

# 2. View job status
cargo run --bin tuning_cli -- show-job --id <job-uuid>

# 3. View leaderboard
cargo run --bin tuning_cli -- leaderboard --strategy-id <uuid>
```

### 3. Paper Trade
```bash
# 1. Check account
cargo run --bin paper_trading_cli -- account

# 2. Submit order
cargo run --bin paper_trading_cli -- submit-order \
  --symbol AAPL --side buy --qty 10

# 3. Monitor positions
cargo run --bin paper_trading_cli -- positions

# 4. Close positions
cargo run --bin paper_trading_cli -- close-all
```

## 🎯 Developing a Tool

### Edit Tool Code
Tools are in `backend/src/tools/[tool_name]/`:
- Modify `core.rs` for types
- Modify `service.rs` for logic
- Modify `cli.rs` for CLI interface
- Add tests to `tests.rs`

### Run Specific Tool Tests
```bash
# While developing strategies tool:
cargo test -p stratbench strategies

# Watch for changes:
# (Install cargo-watch: cargo install cargo-watch)
cargo watch -x 'test -p stratbench strategies'
```

### Use Tool in Main API
Tools are automatically integrated via `main.rs` which:
1. Imports tools from `mod.rs`
2. Creates API routes for each tool
3. Mounts routes under `/api/v1/[tool]/`

Example route mapping:
- `/api/v1/strategies/*` → `tools::strategies::*`
- `/api/v1/strategies/{id}/tuning-jobs/*` → `tools::tuning::*`
- `/api/v1/benchmarks/*` → `tools::benchmarking::*`
- `/api/v1/trading/*` → `tools::paper_trading::*`
- `/api/v1/market-data/*` → `tools::market_data::*`

## 🐛 Debugging

### Check Tool Health
```bash
# Test API endpoint
curl http://localhost:8080/api/v1/strategies | jq .

# Direct CLI test
cargo run --bin strategies_cli -- list

# Check logs (if running via cargo run)
RUST_LOG=debug cargo run
```

### Database Queries
```bash
# Connect to PostgreSQL
psql -h localhost -U postgres -d stratbench

# Check tables (each tool has related tables)
\dt+

# Example queries:
SELECT * FROM strategies LIMIT 5;
SELECT * FROM strategy_tuning_jobs LIMIT 5;
SELECT * FROM benchmark_runs LIMIT 5;
```

## 📚 Full Documentation

For detailed docs on each tool, see:
- [strategies/README.md](strategies/README.md)
- [tuning/README.md](tuning/README.md)
- [benchmarking/README.md](benchmarking/README.md)
- [paper_trading/README.md](paper_trading/README.md)
- [market_data/README.md](market_data/README.md)
- [finrl_integration/README.md](finrl_integration/README.md)

