# 🛠 Tools Organization Index

Complete guide to running and developing compartmentalized trading tools.

## 📍 Where Everything Is

### Documentation Files

| File | Purpose | Audience |
|------|---------|----------|
| [TOOLS_ARCHITECTURE.md](TOOLS_ARCHITECTURE.md) | **Read this first** - Overview of tool structure & architecture | Everyone |
| [QUICK_START_TOOLS.md](QUICK_START_TOOLS.md) | Quick reference for standalone vs integrated usage | Developers & QA |
| [backend/src/tools/*/README.md](backend/src/tools/) | Individual backend tool documentation | Backend developers |
| [frontend/src/tools/*/README.md](frontend/src/tools/) | Individual frontend tool documentation | Frontend developers |

### Running Tools

```
Standalone CLI:        cargo run --bin [tool_cli] -- [command]
Backend API:           curl http://localhost:8080/api/v1/[endpoint]
Frontend Component:    import { [Tool]View } from "@/tools/[tool]"
Full Dashboard:        docker-compose up  OR  npm run dev
Database Direct:       psql -h localhost -U postgres -d stratbench
```

## 🏗 Folder Organization

### Backend Tools (`backend/src/tools/`)

```
strategies/              CRUD management for trading strategies
├── mod.rs               Public API & module exports
├── core.rs              Type definitions (Strategy, CreateStrategy, etc.)
├── service.rs           Business logic trait
├── cli.rs               Standalone CLI runner (--bin strategies_cli)
├── tests.rs             Unit & integration tests
└── README.md            Full documentation

tuning/                  Parameter tuning jobs (manual/auto/LLM)
├── mod.rs               Public API
├── core.rs              Types (StrategyTuningJob, CreateStrategyTuningJob)
├── service.rs           Service trait
├── moa.rs               Multi-agent workflow structures
├── reproducibility.rs   Parameter hashing logic
├── cli.rs               Standalone CLI runner (--bin tuning_cli)
├── tests.rs             Tests + helper tests for hash & MoA
└── README.md            Full documentation

benchmarking/            Backtest execution & metrics
├── mod.rs               Public API
├── core.rs              Types (BenchmarkRun, CreateBenchmarkRun)
├── service.rs           Service trait
├── executor.rs          Bar-by-bar strategy execution
├── metrics.rs           Metrics calculation (Sharpe, Sortino, etc.)
├── cli.rs               Standalone CLI runner (--bin benchmarking_cli)
├── tests.rs             Tests
└── README.md            Full documentation

paper_trading/           Simulated trading engine
├── mod.rs               Public API
├── core.rs              Types (PaperAccount, PaperOrder, etc.)
├── engine.rs            Trading logic
├── service.rs           Service trait
├── cli.rs               Standalone CLI runner (--bin paper_trading_cli)
├── tests.rs             Tests
└── README.md            Full documentation

market_data/             Historical & real-time market data
├── mod.rs               Public API
├── core.rs              Types (BarData, MarketDataStatus)
├── service.rs           Service trait
├── alpaca_client.rs     Alpaca API integration
├── cli.rs               Standalone CLI runner (--bin market_data_cli)
├── tests.rs             Tests
└── README.md            Full documentation

finrl_integration/       FinRL gRPC service integration
├── mod.rs               Public API
├── core.rs              FinRLClient wrapper
├── client.rs            Async gRPC communication
├── strategies/          FinRL strategy impls (PPO, SAC, A2C, TD3)
├── cli.rs               Standalone CLI runner (--bin finrl_cli)
├── tests.rs             Runtime resilience tests
└── README.md            Full documentation
```

### Frontend Tools (`frontend/src/tools/`)

```
strategies/              Strategy management UI
├── index.ts             Public exports (StrategiesView, hooks, types)
├── StrategyTypes.ts     TypeScript interfaces
├── StrategyHooks.ts     React hooks (useStrategies, useStrategyEditor)
├── StrategiesView.tsx   Main container component
├── StrategyEditor.tsx   Create/edit form
├── StrategyList.tsx     List table
├── TuningLeaderboard.tsx Leaderboard display
├── TuningControls.tsx   Tuning job UI
├── __tests__/           Jest tests
└── README.md            Full documentation

tuning/                  Tuning jobs UI
├── index.ts             Public exports
├── TuningTypes.ts       Types
├── TuningHooks.ts       Hooks (useTuningJobs, useTuningCreate)
├── TuningJobsView.tsx   Main view
├── TuningControls.tsx   Control panel
├── TuningLeaderboard.tsx Leaderboard
├── MoAWorkflowPanel.tsx MoA visualization
├── __tests__/           Tests
└── README.md            Full documentation

benchmarking/            Backtest results UI
├── index.ts             Public exports
├── BenchmarkTypes.ts    Types
├── BenchmarkHooks.ts    Hooks
├── BenchmarkView.tsx    Results view
├── BenchmarkResults.tsx Results panel
├── PerformanceChart.tsx Charts
├── MetricsTable.tsx     Metrics display
├── __tests__/           Tests
└── README.md            Full documentation

paper_trading/           Trading UI
├── index.ts             Public exports
├── PaperTradingTypes.ts Types
├── PaperTradingHooks.ts Hooks
├── PaperTradingView.tsx Main view
├── AccountPanel.tsx     Account display
├── PositionsTable.tsx   Holdings table
├── OrderForm.tsx        Order submission
├── OrderHistory.tsx     Order list
├── __tests__/           Tests
└── README.md            Full documentation

market_data/             Data fetching UI
├── index.ts             Public exports
├── MarketDataTypes.ts   Types
├── MarketDataHooks.ts   Hooks
├── MarketDataView.tsx   Main view
├── BarChart.tsx         OHLCV visualization
├── DataFetcher.tsx      Fetch control
├── __tests__/           Tests
└── README.md            Full documentation
```

## 🎯 Common Tasks

### I want to... (find the tool)

| Task | Tool | Backend CLI | Frontend |
|------|------|-------------|----------|
| Create/edit strategies | **Strategies** | `strategies_cli create/update` | Strategies View |
| Tune hyperparameters | **Tuning** | `tuning_cli create-job` | Tuning Panel |
| Backtest strategy | **Benchmarking** | `benchmarking_cli run` | Benchmarking View |
| Simulate trading | **Paper Trading** | `paper_trading_cli submit-order` | Paper Trading View |
| Fetch market data | **Market Data** | `market_data_cli fetch` | Market Data View |
| Use RL models | **FinRL** | `finrl_cli predict` | (in benchmarking) |

### I want to develop...

| Component | Where | Run Tests |
|-----------|-------|-----------|
| Strategies backend | `backend/src/tools/strategies/` | `cargo test -p stratbench strategies` |
| Strategies frontend | `frontend/src/tools/strategies/` | `npm test -- strategies` |
| Tuning backend | `backend/src/tools/tuning/` | `cargo test -p stratbench tuning` |
| Tuning frontend | `frontend/src/tools/tuning/` | `npm test -- tuning` |
| (etc.) | `backend/src/tools/[tool]/` | `cargo test -p stratbench [tool]` |

### I want to test...

```bash
# Test all backend tools
cargo test -p stratbench

# Test one backend tool
cargo test -p stratbench strategies

# Test specific backend test
cargo test -p stratbench finrl_integration::tests::finrl_grpc_runtime_validation_handles_repeated_predict_failures

# Test all frontend tools
npm test

# Test one frontend tool
npm test -- --testPathPattern=benchmarking

# Test with output
cargo test -p stratbench strategies -- --nocapture
```

### I want to run tools...

**Individually (standalone)**:
```bash
cargo run --bin strategies_cli -- list
cargo run --bin tuning_cli -- create-job --strategy-id <uuid> --mode llm
cargo run --bin benchmarking_cli -- run --strategy-id <uuid>
```

**Via API**:
```bash
curl http://localhost:8080/api/v1/strategies
curl http://localhost:8080/api/v1/benchmarks/full
```

**In UI** (integrated):
```bash
docker-compose up
# Or: backend + frontend separately + optional finrl service
```

**In React**:
```tsx
import { StrategiesView } from "@/tools/strategies";
import { TuningJobsView } from "@/tools/tuning";
```

## 📖 Navigation by Role

### Frontend Developer
1. Start: [TOOLS_ARCHITECTURE.md](TOOLS_ARCHITECTURE.md) - Overview
2. Pick tool: [frontend/src/tools/strategies/README.md](frontend/src/tools/strategies/README.md)
3. Component files: `frontend/src/tools/[tool]/`
4. Run tests: `npm test -- [tool]`
5. Dev server: `npm run dev`

### Backend Developer
1. Start: [TOOLS_ARCHITECTURE.md](TOOLS_ARCHITECTURE.md) - Overview
2. Pick tool: [backend/src/tools/strategies/README.md](backend/src/tools/strategies/README.md)
3. Module files: `backend/src/tools/[tool]/`
4. Run tests: `cargo test -p stratbench [tool]`
5. Run server: `cargo run`

### QA / Tester
1. Start: [QUICK_START_TOOLS.md](QUICK_START_TOOLS.md) - Quick reference
2. Run standalone tool: `cargo run --bin [tool]_cli --`
3. Run full dashboard: `docker-compose up`
4. Test scenarios: Each tool README has "Common Tasks" section

### DevOps
1. Deployment: See [TOOLS_ARCHITECTURE.md](TOOLS_ARCHITECTURE.md#-deployment)
2. Docker: `docker-compose.yml` in project root
3. Health checks: [QUICK_START_TOOLS.md](QUICK_START_TOOLS.md#-health-check-script)

## 🔗 Tool Dependencies

```
┌─────────────────────────────────────────────────────┐
│ Strategies (independent)                             │
│   ↑ referenced by                                    │
│   ├─ Tuning (requires strategy_id)                   │
│   ├─ Benchmarking (requires strategy_id)             │
│   └─ Paper Trading (can reference strategies)        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Market Data (independent)                            │
│   ↑ used by                                          │
│   └─ Benchmarking (fetches bars for backtest)        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Paper Trading (independent)                          │
│   ↑ can replay data from                             │
│   └─ Benchmarking (gets trade list)                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ FinRL Integration (backend only)                     │
│   ↑ used by                                          │
│   └─ Benchmarking (FinRL strategies use gRPC)        │
└─────────────────────────────────────────────────────┘
```

## 📊 Typical Workflows

### Workflow: Develop New Strategy Feature
```
1. Edit backend/src/tools/strategies/core.rs (add field)
2. Edit backend/src/tools/strategies/service.rs (add logic)
3. Run cargo test -p stratbench strategies (verify backend)
4. Edit frontend/src/tools/strategies/StrategiesView.tsx (add UI)
5. Run npm test -- strategies (verify frontend)
6. Test in UI: docker-compose up → Strategies tab
```

### Workflow: Fix Tool Bug
```
1. Identify tool: Check TOOLS_ARCHITECTURE.md
2. Read tool README: backend/src/tools/[tool]/README.md
3. Locate code: backend/src/tools/[tool]/ or frontend/src/tools/[tool]/
4. Run unit tests: cargo test -p stratbench [tool] (or npm test -- [tool])
5. Make fix
6. Verify tests pass
7. Test standalone: cargo run --bin [tool]_cli
8. Test in UI: docker-compose up
```

### Workflow: Add New Tool
```
1. Create directories:
   - backend/src/tools/my_tool/{mod.rs,core.rs,service.rs,cli.rs,tests.rs,README.md}
   - frontend/src/tools/my_tool/{index.ts,MyToolTypes.ts,MyToolHooks.ts,MyToolView.tsx,README.md}
2. Implement backend: core types → service logic → CLI wrapper
3. Implement frontend: Types → Hooks → Components
4. Add to exports: backend/src/tools/mod.rs + frontend/src/tools/index.ts
5. Write comprehensive README
6. Add tests
7. Document in TOOLS_ARCHITECTURE.md
```

## 🚀 Quick Commands Reference

```bash
# Backend
cargo build              # Build all tools
cargo run               # Run backend server
cargo run --bin strategies_cli -- list          # Run strategies tool
cargo run --bin tuning_cli -- list-jobs ...     # Run tuning tool
cargo test -p stratbench                         # Test all tools
cargo test -p stratbench [tool]                  # Test specific tool

# Frontend
npm install             # Install dependencies
npm run dev             # Dev server
npm run build           # Production build
npm test                # Run all tests
npm test -- [tool]      # Test specific tool

# Docker
docker-compose up                     # Full stack
docker-compose down                   # Stop all services
docker-compose logs [service]         # View logs

# Database
psql -h localhost -U postgres -d stratbench
SELECT * FROM strategies LIMIT 5;
SELECT * FROM strategy_tuning_jobs LIMIT 5;
SELECT * FROM benchmark_runs LIMIT 5;
```

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Tool tests fail | Check tool README for dependencies |
| CLI tool not found | `cargo run --bin [tool]_cli -- help` |
| Frontend component not loading | Check `frontend/src/tools/[tool]/index.ts` exports |
| API endpoints return 404 | Verify backend is running: `curl http://localhost:8080/api/v1/health` |
| Docker compose fails | `docker-compose down -v && docker-compose up` |
| Database locked | Restart PostgreSQL: `docker-compose restart postgres` |

## 📞 Getting Help

1. **Tool-specific questions**: Read the tool's README
2. **Architecture questions**: Read [TOOLS_ARCHITECTURE.md](TOOLS_ARCHITECTURE.md)
3. **Quick reference**: Check [QUICK_START_TOOLS.md](QUICK_START_TOOLS.md)
4. **Implementation questions**: Look at similar tools' code

