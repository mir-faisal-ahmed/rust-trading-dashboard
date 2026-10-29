# Tuning Tool

Self-contained module for parameter tuning jobs (manual, auto, LLM) with reproducibility tracking and MoA workflow support.

## Overview

The Tuning Tool manages hyperparameter optimization for trading strategies. It supports three modes:

- **Manual**: User-defined parameter sets evaluated via benchmarking
- **Auto**: Grid/random search over parameter space
- **LLM**: Multi-agent autoresearch workflow with AI-guided optimization

## Key Features

- **Reproducibility**: Each job tracked with:
  - `parameter_hash`: Deterministic SHA-256 of parameter grid (reproducible runs)
  - `model_name`: Trained model identifier (e.g., `td3_v1`, `moa-autoresearch`)
  - `backtest_date_from`/`backtest_date_to`: Exact backtest window
  
- **MoA (Multi-Agent) Workflow**: For LLM mode, jobs seeded with:
  - Agent list (market-research, model-selection, risk, synthesis)
  - Discussion rounds storage
  - Recommendation slots for best parameters
  - Code change plan artifacts

## Standalone CLI Usage

```bash
# List tuning jobs for a strategy
cargo run --bin tuning_cli -- list-jobs --strategy-id <uuid>

# Create a manual tuning job
cargo run --bin tuning_cli -- create-job \
  --strategy-id <uuid> \
  --mode manual \
  --objective sharpe_ratio \
  --param-grid '{"lookback":[10,20,30]}'

# Create an LLM tuning job
cargo run --bin tuning_cli -- create-job \
  --strategy-id <uuid> \
  --mode llm \
  --objective maximize_sharpe \
  --models "td3_v1,ppo_v1" \
  --start-date 2024-01-01 \
  --end-date 2024-12-31 \
  --notes "Optimize for low-drawdown regime"

# Show job details with reproducibility info
cargo run --bin tuning_cli -- show-job --id <uuid>

# List completed jobs sorted by metric
cargo run --bin tuning_cli -- leaderboard --strategy-id <uuid>

# Export job for reproducibility
cargo run --bin tuning_cli -- export --id <uuid> --format json
```

## API Integration

All endpoints prefixed with `/api/v1/strategies/{strategy_id}/tuning-jobs`:

```bash
# GET /strategies/{id}/tuning-jobs
curl http://localhost:8080/api/v1/strategies/550e8400-e29b-41d4-a716-446655440000/tuning-jobs

# POST /strategies/{id}/tuning-jobs
curl -X POST http://localhost:8080/api/v1/strategies/{id}/tuning-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "llm",
    "objective": "sharpe_ratio",
    "parameter_grid": {"alpha": [0.01, 0.05, 0.1]},
    "model_hints": ["td3_v1", "ppo_v1"],
    "notes": "Test tuning run",
    "backtest_date_from": "2024-01-01",
    "backtest_date_to": "2024-12-31"
  }'
```

## File Structure

```
backend/src/tools/tuning/
├── mod.rs              # Module exports
├── core.rs             # Type definitions
├── service.rs          # TuningService implementation
├── moa.rs              # MoA workflow structures and helpers
├── reproducibility.rs  # Parameter hashing & reproducibility utilities
├── cli.rs              # Standalone CLI
├── tests.rs            # Unit & integration tests
└── README.md           # This file
```

## Core Types

```rust
pub enum TuningJobMode {
    Manual,
    Auto,
    Llm,
}

pub struct CreateStrategyTuningJob {
    pub mode: String,
    pub objective: String,
    pub parameter_grid: serde_json::Value,
    pub model_hints: serde_json::Value,
    pub notes: String,
    pub backtest_date_from: Option<chrono::NaiveDate>,
    pub backtest_date_to: Option<chrono::NaiveDate>,
}

pub struct StrategyTuningJob {
    pub id: Uuid,
    pub strategy_id: Uuid,
    pub mode: String,
    pub status: String,
    pub objective: String,
    pub parameter_grid: serde_json::Value,
    pub model_hints: serde_json::Value,
    pub notes: String,
    pub results: Option<serde_json::Value>,
    pub model_name: Option<String>,
    pub parameter_hash: Option<String>,
    pub best_metric_value: Option<f64>,
    pub backtest_date_from: Option<chrono::NaiveDate>,
    pub backtest_date_to: Option<chrono::NaiveDate>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}
```

## MoA Workflow Structure

When a job is created with `mode: "llm"`, it's seeded with:

```json
{
  "workflow": "moa_autoresearch",
  "status": "seeded",
  "objective": "maximize sharpe ratio",
  "agents": [
    {"name": "market-research-agent", "role": "Analyze market regime..."},
    {"name": "model-selection-agent", "role": "Compare candidate models..."},
    {"name": "risk-agent", "role": "Constrain parameters by risk..."},
    {"name": "synthesis-agent", "role": "Combine into ranked recommendations..."}
  ],
  "candidate_models": ["td3_v1", "ppo_v1"],
  "discussion_rounds": [],
  "recommendations": {
    "best_parameters": null,
    "benchmark_label": null,
    "confidence": null
  },
  "code_change_plan": []
}
```

## Reproducibility & Hashing

### Parameter Hash
Each tuning job automatically computes a deterministic parameter hash:

```rust
use tuning::reproducibility::compute_parameter_hash;

let hash = compute_parameter_hash(&parameter_grid);
// hash: "a1b2c3d4e5f6..."  (first 8 chars often used as short SHA)
```

This enables:
- Reproducing exact tuning runs
- Benchmarking table labels: `strategy_name + param_hash`
- Sharing reproducible configurations

### Metadata Tracking
```
Model: td3_v1
SHA: a1b2c3d4 (short form)
Dates: 2024-01-01…2024-12-31
Best Metric: 0.8234
```

## Testing

```bash
# Run all tuning tests
cargo test -p stratbench tuning

# Test reproducibility hash stability
cargo test -p stratbench tuning::reproducibility::tests

# Test MoA seeding
cargo test -p stratbench tuning::moa::tests

# With verbose output
cargo test -p stratbench tuning -- --nocapture
```

## Integration with Other Tools

### Create Job → Run Benchmark
```bash
# 1. Create tuning job
JOB_ID=$(cargo run --bin tuning_cli -- create-job ... | jq .id)

# 2. Run benchmark with job parameters
cargo run --bin benchmarking_cli -- run \
  --strategy-id <uuid> \
  --from-tuning-job $JOB_ID
```

### View Leaderboard in UI
The tuning leaderboard shows completed jobs sorted by `best_metric_value`:

```
Rank | Mode | Status    | Objective    | Best Metric | Model      | Param SHA | Dates
-----|------|-----------|--------------|-------------|------------|-----------|------------------
  1  | llm  | completed | sharpe_ratio | 0.8234      | td3_v1     | a1b2c3d4  | 2024-01-01…12-31
  2  | auto | completed | sortino_ratio| 0.7891      | ppo_v1     | f5e6d7c8  | 2024-02-01…12-31
```

## Common Patterns

### Comparing Parameter Sets
```bash
# Export both jobs
cargo run --bin tuning_cli -- export --id <job1-uuid> > job1.json
cargo run --bin tuning_cli -- export --id <job2-uuid> > job2.json

# Compare parameter hashes
diff <(jq .parameter_hash job1.json) <(jq .parameter_hash job2.json)
```

### Archiving Tuning Results
```bash
# Export all completed jobs for a strategy
cargo run --bin tuning_cli -- list-jobs --strategy-id <uuid> \
  --filter completed --format json > archive.json
```

## Architecture Notes

- **Deterministic Hashing**: Uses canonical JSON ordering (BTreeMap) + SHA-256
- **MoA Agnostic**: Workflow structure is stored; actual agent execution is external
- **Async-Ready**: Database operations are async; CLI provides blocking wrappers
- **Reproducibility-First**: All jobs capture exact date ranges and parameter configs

