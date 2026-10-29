# Trading Dashboard Tools Documentation

Comprehensive guide to compartmentalized trading tools that can run individually or integrated in the UI.

## 📁 Tools Architecture

The trading dashboard is organized into **6 self-contained tools**, each with:
- Backend module (Rust)
- Frontend component (React)
- Standalone CLI runner
- Tests and documentation
- Clear API boundaries

### Backend Tools
```
backend/src/tools/
├── strategies/          CRUD & lifecycle for strategies
├── tuning/             Parameter tuning (manual/auto/LLM)
├── benchmarking/       Backtest execution & metrics
├── paper_trading/      Simulated trading engine
├── market_data/        Data fetching & caching
└── finrl_integration/  FinRL gRPC integration
```

### Frontend Tools
```
frontend/src/tools/
├── strategies/         Strategy management UI
├── tuning/            Tuning jobs & leaderboard
├── benchmarking/      Results & performance charts
├── paper_trading/     Account & trading UI
└── market_data/       Data fetching & charting
```

## 🛠 Standalone Tool Usage

Each tool can be run independently via CLI for testing, debugging, or standalone usage.

### Strategies Tool

**Backend CLI**:
```bash
# List strategies
cargo run --bin strategies_cli -- list

# Create strategy
cargo run --bin strategies_cli -- create \
  --name "My Strategy" \
  --type rl_portfolio_optimization \
  --asset-class equity \
  --params '{"symbols":["AAPL"]}'

# Get details
cargo run --bin strategies_cli -- get --id <uuid>
```

**Frontend Component**:
```tsx
import { StrategiesView } from "@/tools/strategies";
<StrategiesView />
```

📖 **Full Documentation**: [backend/src/tools/strategies/README.md](../../backend/src/tools/strategies/README.md)

---

### Tuning Tool

**Backend CLI**:
```bash
# List tuning jobs
cargo run --bin tuning_cli -- list-jobs --strategy-id <uuid>

# Create LLM tuning job
cargo run --bin tuning_cli -- create-job \
  --strategy-id <uuid> \
  --mode llm \
  --objective sharpe_ratio \
  --models "td3_v1,ppo_v1"

# Show leaderboard
cargo run --bin tuning_cli -- leaderboard --strategy-id <uuid>
```

**Frontend Component**:
```tsx
import { TuningJobsView, TuningLeaderboard } from "@/tools/tuning";
<TuningJobsView strategyId={id} />
<TuningLeaderboard strategyId={id} />
```

📖 **Full Documentation**: [backend/src/tools/tuning/README.md](../../backend/src/tools/tuning/README.md)

---

### Benchmarking Tool

**Backend CLI**:
```bash
# Run benchmark
cargo run --bin benchmarking_cli -- run \
  --strategy-id <uuid> \
  --start 2024-01-01 \
  --end 2024-12-31

# View results
cargo run --bin benchmarking_cli -- results --run-id <uuid>

# Export equity curve
cargo run --bin benchmarking_cli -- export-equity --run-id <uuid> > equity.csv
```

**Frontend Component**:
```tsx
import { BenchmarkView } from "@/tools/benchmarking";
<BenchmarkView strategyId={id} />
```

📖 **Full Documentation**: [backend/src/tools/benchmarking/README.md](../../backend/src/tools/benchmarking/README.md)

---

### Paper Trading Tool

**Backend CLI**:
```bash
# Check account
cargo run --bin paper_trading_cli -- account

# Submit order
cargo run --bin paper_trading_cli -- submit-order \
  --symbol AAPL \
  --side buy \
  --qty 10

# Close all positions
cargo run --bin paper_trading_cli -- close-all
```

**Frontend Component**:
```tsx
import { PaperTradingView } from "@/tools/paper_trading";
<PaperTradingView />
```

📖 **Full Documentation**: [backend/src/tools/paper_trading/README.md](../../backend/src/tools/paper_trading/README.md)

---

### Market Data Tool

**Backend CLI**:
```bash
# Fetch historical data
cargo run --bin market_data_cli -- fetch \
  --symbol AAPL \
  --start 2024-01-01 \
  --end 2024-12-31

# Get bars
cargo run --bin market_data_cli -- get-bars \
  --symbol AAPL \
  --limit 100

# Check status
cargo run --bin market_data_cli -- status
```

**Frontend Component**:
```tsx
import { MarketDataView, BarChart } from "@/tools/market_data";
<BarChart symbol="AAPL" timeframe="1day" />
```

📖 **Full Documentation**: [backend/src/tools/market_data/README.md](../../backend/src/tools/market_data/README.md)

---

### FinRL Integration Tool

**Backend CLI**:
```bash
# Check service health
cargo run --bin finrl_cli -- health

# Load model
cargo run --bin finrl_cli -- load-model --model-id td3_v1

# Make prediction
cargo run --bin finrl_cli -- predict --model-id td3_v1 \
  --features "[1.02, 0.45, ...]"
```

**Frontend**: Used internally by FinRL strategies (PPO, SAC, A2C, TD3)

📖 **Full Documentation**: [backend/src/tools/finrl_integration/README.md](../../backend/src/tools/finrl_integration/README.md)

---

## 🔗 Integration in UI

All tools are integrated via the main dashboard components:

### App Layout
```tsx
import { App } from "./App";

// App.tsx automatically imports all tools
export function Dashboard() {
  return <App />;
}
```

### Navigation
The UI sidebar provides quick access to each tool:
- **F1**: Strategies
- **F2**: Tuning
- **F3**: Benchmarking
- **F4**: Paper Trading
- **F5**: Market Data
- **F10**: Live Trading

Each view can be independently developed, tested, and updated.

---

## 🧪 Testing Tools

### Backend Tests

```bash
# Test individual tool
cargo test -p stratbench strategies
cargo test -p stratbench tuning
cargo test -p stratbench benchmarking
cargo test -p stratbench paper_trading
cargo test -p stratbench market_data
cargo test -p stratbench finrl_integration

# Test with output
cargo test -p stratbench strategies -- --nocapture

# Test specific function
cargo test -p stratbench strategies::tests::test_create_strategy
```

### Frontend Tests

```bash
# Test individual tool
npm test -- --testPathPattern=strategies
npm test -- --testPathPattern=tuning
npm test -- --testPathPattern=benchmarking
npm test -- --testPathPattern=paper_trading
npm test -- --testPathPattern=market_data

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

---

## 📊 Tool Dependencies

```
┌─ Strategies
├─ Tuning ──→ Strategies (requires strategy)
├─ Benchmarking ──→ Strategies, Market Data
├─ Paper Trading (independent)
├─ Market Data (independent)
└─ FinRL Integration ──→ Used by Benchmarking
```

### Typical Workflow

1. **Create Strategy** (Strategies Tool)
2. **Queue Tuning Job** (Tuning Tool) with parameter grid
3. **Fetch Market Data** (Market Data Tool) for date range
4. **Run Benchmark** (Benchmarking Tool) with tuned parameters
5. **Simulate in Paper Trading** (Paper Trading Tool)
6. **Deploy** (live execution)

---

## 🔧 Adding a New Tool

To add a new compartmentalized tool:

1. **Create backend structure**:
```bash
mkdir -p backend/src/tools/my_tool
touch backend/src/tools/my_tool/{mod.rs,core.rs,service.rs,cli.rs,tests.rs,README.md}
```

2. **Create frontend structure**:
```bash
mkdir -p frontend/src/tools/my_tool
touch frontend/src/tools/my_tool/{index.ts,MyToolTypes.ts,MyToolHooks.ts,MyToolView.tsx,README.md}
```

3. **Add to exports**:
```rust
// backend/src/tools/mod.rs
pub mod my_tool;

// frontend/src/tools/index.ts
export * from "./my_tool";
```

4. **Implement API routes** (in main.rs or api module)
5. **Write README** with standalone and integrated usage
6. **Add tests**

---

## 🚀 Deployment

### Docker

Each tool can be deployed independently or as part of the full stack:

```bash
# Full stack
docker-compose up

# Or individual service + dependencies
docker-compose up postgres redis backend frontend
```

### Standalone Tools

```bash
# Compile tool CLI
cargo build --release --bin strategies_cli

# Run
./target/release/strategies_cli list
```

---

## 📋 Tool File Structure Reference

### Backend Tool Template
```
backend/src/tools/[tool_name]/
├── mod.rs              # Public API & documentation
├── core.rs             # Types and data models
├── service.rs          # Business logic trait
├── cli.rs              # Standalone CLI entry
├── tests.rs            # Unit & integration tests
└── README.md           # Full documentation
```

### Frontend Tool Template
```
frontend/src/tools/[tool_name]/
├── index.ts            # Public exports
├── [Tool]Types.ts      # TypeScript interfaces
├── [Tool]Hooks.ts      # Custom React hooks
├── [Tool]View.tsx      # Main container component
├── [Tool]Panel.tsx     # Sub-components
├── README.md           # Documentation
└── __tests__/
    └── [Tool].test.tsx # Jest tests
```

---

## 📚 Documentation Standards

Each tool README includes:
- **Overview**: What the tool does
- **Standalone Usage**: CLI examples
- **API Integration**: REST endpoints (backend) or React hooks (frontend)
- **File Structure**: Module organization
- **Core Types**: Key data structures
- **Common Patterns**: Usage examples
- **Testing**: How to run tests
- **Integration**: How it works with other tools
- **Performance Tips**: Optimization guidance
- **Troubleshooting**: Known issues and solutions

---

## 🤝 Contributing

To update a tool:

1. **Modify code** in `backend/src/tools/[tool]/` or `frontend/src/tools/[tool]/`
2. **Run standalone tests**: `cargo test -p stratbench [tool]` or `npm test -- [tool]`
3. **Update README** if behavior changes
4. **Test in UI** to ensure integration works
5. **Commit** with atomic changes per tool

---

## 📞 Support

For each tool, consult its README:
- Backend: `backend/src/tools/[tool]/README.md`
- Frontend: `frontend/src/tools/[tool]/README.md`

For cross-tool issues, check the integration section of affected tools.

