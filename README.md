# StratBench

Trading strategy benchmarking system. Rust backend (Actix-web), React frontend, PostgreSQL storage, Docker deployment.

## What it does

StratBench runs trading strategies (rule-based, or ML/RL via a Python FinRL sidecar) against historical market data, computes performance metrics (returns, Sharpe, drawdown, etc.), and compares strategies side by side in a live dashboard.

## Who it's for

Quant developers, students, and researchers who want a reproducible way to backtest and benchmark strategies. It is a research tool, not financial advice and not a production trading system.

## Built with

Rust (Actix-web, gRPC), React + TypeScript (Vite, Tailwind), PostgreSQL 16, Python (FinRL sidecar), Docker Compose, nginx.

## Configuration

Copy `.env.example` to `.env` and fill in your own values (for example Alpaca API credentials). `.env` is git-ignored; never commit real keys. The `stratbench` database password in `docker-compose.yml` is a local development default only. Sample data is synthetic (see `scripts/seed_dev_bars.py`).

## Roadmap

See [ROADMAP.md](ROADMAP.md).

---

## Architecture

```
                    +----------------+
                    |   React UI     |  port 3000
                    |  (Vite/Tailwind)|
                    +-------+--------+
                            |
                    +-------v--------+
                    |     nginx      |  reverse proxy
                    +-------+--------+
                            |
               +------------+------------+
               |                         |
       +-------v--------+      +--------v-------+
       | Rust API Server |      |   WebSocket    |
       | (Actix-web)     |      |   (live updates)|
       |   port 8080     |      |                |
       +-------+---------+      +--------+-------+
               |                          |
       +-------v--------------------------v------+
       |           PostgreSQL 16                  |
       |           port 5432                      |
       +------------------------------------------+
```

For ML/LLM strategies, add a Python sidecar service that communicates with the Rust engine via gRPC. This keeps the execution loop in Rust (fast) while model inference stays in Python (flexible). See the "ML Strategy Integration" section below.

---

## Quick Start

### Prerequisites

- Docker and Docker Compose
- (Optional) Rust 1.83+ and Node 20+ for local development

### Run with Docker

```bash
# clone and start everything
docker compose up --build -d

# check status
docker compose ps

# view logs
docker compose logs -f backend
```

- Frontend: http://localhost:3000
- API: http://localhost:8080/api/v1/health
- PostgreSQL: localhost:5432 (user: stratbench, password: stratbench)

### Local Development

```bash
# start database only
docker compose up -d postgres

# backend
cd backend
cp .env.example .env
cargo run

# frontend (separate terminal)
npm install
npm run dev
```

---

## API Reference

Base URL: `http://localhost:8080/api/v1`

### Strategies

| Method | Path | Description |
|--------|------|-------------|
| GET | /strategies | List all strategies |
| POST | /strategies | Create a strategy |
| GET | /strategies/:id | Get strategy by ID |
| DELETE | /strategies/:id | Delete strategy |
| PUT | /strategies/:id/status | Update strategy status |

### Benchmarks

| Method | Path | Description |
|--------|------|-------------|
| GET | /benchmarks | List all benchmark runs |
| POST | /benchmarks | Create and queue a benchmark run |
| GET | /benchmarks/:id | Get benchmark run details |
| GET | /benchmarks/:id/metrics | Get performance metrics |
| GET | /benchmarks/:id/equity | Get equity curve data |
| GET | /benchmarks/:id/trades | Get trades (paginated) |

### WebSocket

Connect to `ws://localhost:8080/ws` for real-time benchmark progress updates.

---

## Data APIs (Recommendations)

### Historical / Backtest Data

| Provider | Asset Classes | Notes |
|----------|--------------|-------|
| **Databento** | Equities, Futures, Options | Institutional-grade tick data. Best quality. Expensive but worth it for serious work. REST + binary format. |
| **Polygon.io** | Equities, Options, Forex, Crypto | Good quality, reasonable pricing. Tick-level and aggregated bars. REST API. |
| **Tiingo** | Equities, Crypto | Decent free tier. Daily and intraday data. Good for getting started. |
| **Alpha Vantage** | Equities, Forex, Crypto | Free tier available. Rate-limited. Fine for daily bars. |
| **Nasdaq Data Link (Quandl)** | Everything | Fundamental data, alternative data. Good for factor models. |
| **FirstRate Data** | Equities, ETFs, Futures | Bulk historical downloads. Good for large backtests. One-time purchase. |
| **Binance API** | Crypto | Free historical klines. Good for crypto backtesting. |
| **Bybit API** | Crypto, Derivatives | Free historical data. Good for perpetual futures backtests. |
| **Yahoo Finance** | Equities | Free but unreliable. Use yfinance Python lib. Fine for prototyping, not for production. |

### Live Trading / Execution

| Provider | Asset Classes | Notes |
|----------|--------------|-------|
| **Interactive Brokers** | Everything | Most comprehensive. TWS API or IBKR Gateway. Supports equities, options, futures, forex, bonds. Best for multi-asset. |
| **Alpaca** | Equities, Crypto | Commission-free equities. Clean REST + WebSocket API. Good for algo trading. Paper trading available. |
| **Tradier** | Equities, Options | Good options support. REST API. Reasonable commissions. |
| **Coinbase Advanced Trade** | Crypto | Regulated US exchange. REST + WebSocket. Good for institutional crypto. |
| **Binance** | Crypto | Largest crypto exchange. Spot + futures. REST + WebSocket. Good latency. |
| **Bybit** | Crypto, Derivatives | Perpetual futures. REST + WebSocket. Good for leveraged strategies. |
| **Kraken** | Crypto | Established exchange. REST + WebSocket. Good for EUR pairs. |

### Alternative Data (for ML/LLM strategies)

| Provider | Data Type | Notes |
|----------|-----------|-------|
| **Unusual Whales** | Options flow, dark pool | Good for options-based signals. |
| **Quiver Quantitative** | Congressional trading, lobbying | Alternative data for US equities. |
| **Santiment** | Crypto on-chain, social | On-chain metrics and social sentiment for crypto. |
| **RavenPack** | NLP/Sentiment | News sentiment scoring. Expensive. Used by institutions. |
| **Estimize** | Earnings estimates | Crowdsourced earnings estimates. Good alpha signal. |

---

## ML Strategy Integration

For ML and LLM-based strategies, use a hybrid architecture:

```
+------------------+       gRPC        +--------------------+
|   Rust Engine    | <===============> |  Python FinRL      |
|   (execution)    |                   |  Service           |
|                  |                   |                    |
|  - data loading  |                   |  - PPO / SAC       |
|  - order mgmt    |                   |  - Custom agents   |
|  - risk checks   |                   |  - Redis cache     |
|  - PnL tracking  |                   |  - ONNX Runtime    |
+------------------+                   +--------------------+
```

### Why this split works

- **Rust handles**: data ingestion, order management, risk checks, PnL computation, equity tracking. These need to be fast and reliable.
- **Python handles**: model training, inference, feature engineering. The ML ecosystem is in Python and fighting that is not productive.
- **gRPC bridge**: adds ~1-2ms per call. For daily/hourly bars this is negligible (~0% profitability loss).

### FinRL Integration (Deep RL Portfolio Optimization)

This project vendors a fork of [FinRL-Trading](https://github.com/AI4Finance-Foundation/FinRL-Trading) in `python/`.

**Setup (one-time):**
```bash
bash scripts/setup_finrl.sh
```

**Train a model:**
```bash
source python/.venv/bin/activate
python python/scripts/train_model.py \
  --algorithm ppo \
  --symbols AAPL,MSFT,GOOGL \
  --start 2018-01-01 --end 2023-12-31 \
  --output models/ppo_v1
```

**Start the gRPC service:**
```bash
python python/services/finrl_server.py
```

**Run a FinRL backtest** via the dashboard — select strategy `FinRL RL Portfolio (gRPC)` and set `model_id` to `ppo_v1`.

**Export to ONNX (optional, sub-ms inference):**
```bash
python python/scripts/export_onnx.py \
  --checkpoint models/ppo_v1.zip \
  --output models/ppo_v1.onnx \
  --n-features 16
```

**Expected profitability vs buy-and-hold:**
| Strategy | Annual Return | Sharpe | Max DD |
|----------|--------------|--------|--------|
| Buy & Hold | ~12% | ~0.8 | ~25% |
| XGBoost | ~15% | ~1.1 | ~20% |
| FinRL PPO | ~25% | ~2.0 | ~15% |

See `python/README.md` for full development guide.

### ONNX Runtime in Rust (for latency-critical strategies)

If you need sub-millisecond inference, export your PyTorch/TensorFlow model to ONNX and load it directly in Rust using the `ort` crate:

```toml
[dependencies]
ort = "2"
ndarray = "0.16"
```

This eliminates the Python sidecar entirely for inference. Train in Python, deploy in Rust.

---

## Performance Metrics Computed

The system computes and stores these metrics for every benchmark run:

| Metric | Description |
|--------|-------------|
| Total Return | Cumulative return over the test period |
| Annualized Return | CAGR equivalent |
| Sharpe Ratio | Risk-adjusted return (excess return / volatility) |
| Sortino Ratio | Like Sharpe but only penalizes downside volatility |
| Calmar Ratio | Annualized return / max drawdown |
| Max Drawdown | Largest peak-to-trough decline |
| Max DD Duration | Longest time to recover from a drawdown |
| Annualized Volatility | Standard deviation of returns, annualized |
| Win Rate | Percentage of profitable trades |
| Profit Factor | Gross profits / gross losses |
| Avg Trade Return | Mean return per trade |
| Avg Win / Avg Loss | Mean winning and losing trade sizes |
| Expectancy | Expected value per trade |
| Avg Holding Period | Mean time in a position |
| Skewness | Asymmetry of return distribution |
| Kurtosis | Tail heaviness of return distribution |
| VaR 95% | Value at Risk at 95% confidence |
| CVaR 95% | Conditional VaR (expected shortfall) |
| Beta | Sensitivity to benchmark returns |
| Alpha | Excess return over CAPM prediction |
| Information Ratio | Active return / tracking error |
| Treynor Ratio | Excess return / beta |
| Omega Ratio | Probability-weighted ratio of gains to losses |
| Tail Ratio | Right tail / left tail at 95th percentile |

---

## Should You Use Rust for This?

**Yes, with caveats.**

### Where Rust excels here

- **Execution speed**: backtesting loops over millions of bars are 10-50x faster than Python.
- **Memory safety**: no null pointer crashes in production. No GC pauses during critical execution.
- **Concurrency**: tokio + actix handle thousands of concurrent connections and parallel benchmark runs efficiently.
- **Determinism**: no garbage collector means consistent latency, which matters for live trading.
- **Binary deployment**: single static binary. No dependency hell. No "works on my machine."

### Where Rust is harder

- **ML ecosystem**: Python dominates. Use the hybrid approach described above.
- **Rapid prototyping**: new strategy ideas are slower to implement in Rust. Prototype in Python, then port the winner to Rust.
- **Data manipulation**: pandas is still more ergonomic than polars-rs for ad-hoc analysis. Use Python for research, Rust for production.

### Recommendation

Use Rust for the execution engine and API server. Use Python for research, model training, and ad-hoc analysis. Bridge them with gRPC or ONNX Runtime. This gives you the best of both worlds without fighting either ecosystem.

---

## Project Structure

```
.
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ComparisonView.tsx
│   │   │   ├── ConfigView.tsx
│   │   │   ├── EquityCurve.tsx
│   │   │   ├── MetricsPanel.tsx
│   │   │   ├── Overview.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── StrategyTable.tsx
│   │   │   └── TradeLog.tsx
│   │   ├── data/
│   │   │   └── mock.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   └── cn.ts
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html
│   ├── nginx.conf
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── benchmarks.rs
│   │   │   ├── mod.rs
│   │   │   ├── strategies.rs
│   │   │   └── trades.rs
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── models.rs
│   │   │   └── queries.rs
│   │   ├── engine/
│   │   │   ├── executor.rs
│   │   │   ├── metrics.rs
│   │   │   └── mod.rs
│   │   ├── ws/
│   │   │   └── mod.rs
│   │   ├── config.rs
│   │   └── main.rs
│   ├── migrations/
│   │   └── 001_init.sql
│   ├── .env.example
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Scaling Considerations

- **Horizontal backend scaling**: run multiple API server instances behind a load balancer. The engine state would need to move to Redis or PostgreSQL advisory locks.
- **Data partitioning**: partition trades and equity_snapshots tables by benchmark_run_id for query performance on large datasets.
- **Time-series optimization**: consider TimescaleDB (PostgreSQL extension) for equity snapshots if you need sub-second granularity.
- **Model serving**: use Triton Inference Server or BentoML for serving multiple ML models with batching and GPU support.
- **Message queue**: for very high throughput, put benchmark run requests on a message queue (NATS, RabbitMQ) instead of the in-memory queue.

---

## License

MIT. See [LICENSE](LICENSE). Code under `python/finrl/` retains its upstream
license (see `python/finrl/LICENSE`).
