# Strategies Tool

Self-contained module for CRUD and lifecycle management of trading strategies.

## Overview

The Strategies Tool manages the creation, retrieval, updating, and retirement of trading strategies. Each strategy contains:
- **Code key**: Stable identifier for the strategy implementation (e.g., `finrl_ppo`, `dual_momentum_v1`)
- **Parameters**: JSON configuration for strategy execution
- **Metadata**: Name, type, asset class, description, status
- **Lifecycle**: Active, retired, or failed states

## Standalone CLI Usage

```bash
# List all active strategies
cargo run --bin strategies_cli -- list

# List including inactive/retired
cargo run --bin strategies_cli -- list --include-inactive

# Get a specific strategy
cargo run --bin strategies_cli -- get --id <uuid>

# Create a new strategy
cargo run --bin strategies_cli -- create \
  --name "My RL Strategy" \
  --type rl_portfolio_optimization \
  --asset-class equity \
  --description "Test strategy" \
  --params '{"symbols":["AAPL","MSFT"]}'

# Update a strategy
cargo run --bin strategies_cli -- update --id <uuid> \
  --name "Updated Name"

# Retire a strategy
cargo run --bin strategies_cli -- retire --id <uuid>
```

## API Integration

All endpoints prefixed with `/api/v1/strategies`:

```bash
# GET /strategies
curl http://localhost:8080/api/v1/strategies

# GET /strategies?include_inactive=true
curl http://localhost:8080/api/v1/strategies?include_inactive=true

# GET /strategies/{id}
curl http://localhost:8080/api/v1/strategies/550e8400-e29b-41d4-a716-446655440000

# PUT /strategies/{id}
curl -X PUT http://localhost:8080/api/v1/strategies/{id} \
  -H "Content-Type: application/json" \
  -d '{"name":"New Name",...}'

# DELETE /strategies/{id}
curl -X DELETE http://localhost:8080/api/v1/strategies/550e8400-e29b-41d4-a716-446655440000
```

## File Structure

```
backend/src/tools/strategies/
├── mod.rs              # Module exports and documentation
├── core.rs             # Type definitions (CreateStrategy, UpdateStrategy)
├── service.rs          # StrategyService trait and implementations
├── cli.rs              # Standalone CLI entry point
├── tests.rs            # Unit and integration tests
└── README.md           # This file
```

## Core Types

```rust
pub struct Strategy {
    pub id: Uuid,
    pub code_key: Option<String>,
    pub source_path: Option<String>,
    pub name: String,
    pub strategy_type: String,
    pub asset_class: String,
    pub status: String,
    pub is_active: bool,
    pub retired_at: Option<DateTime<Utc>>,
    pub description: String,
    pub parameters: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct CreateStrategy {
    pub name: String,
    pub strategy_type: String,
    pub asset_class: String,
    pub description: String,
    pub parameters: serde_json::Value,
}
```

## Example: Adding a New Strategy

1. Define in code (or register via CLI):
```bash
cargo run --bin strategies_cli -- create \
  --name "Momentum Trading" \
  --type momentum \
  --asset-class equity \
  --params '{"lookback":20,"threshold":0.02}'
```

2. Use in benchmarks:
```bash
cargo run --bin benchmarking_cli -- run \
  --strategy-id <returned-uuid> \
  --start 2024-01-01 \
  --end 2024-12-31
```

## Testing

```bash
# Run all tests for this tool
cargo test -p stratbench strategies

# Run specific test
cargo test -p stratbench strategies::tests::test_create_strategy

# With output
cargo test -p stratbench strategies -- --nocapture
```

## Common Patterns

### Check Strategy Status
```rust
if strategy.is_active && strategy.status != "retired" {
    // Ready for execution
}
```

### Clone Strategy with Modifications
Use the CLI to fetch, then create a new one with `--copy-params` flag:
```bash
cargo run --bin strategies_cli -- get --id <original-id> | \
  cargo run --bin strategies_cli -- create --from-json -
```

### Monitor Strategy Lifecycle
Strategies can be in these states:
- **idle**: Ready for execution
- **running**: Currently executing a benchmark
- **failed**: Last execution failed
- **retired**: No longer used

