# FinRL Integration Tool

Self-contained module for gRPC integration with the FinRL Python service for RL-based strategy execution.

## Overview

The FinRL Integration Tool provides a bridge between the Rust backtesting engine and the Python FinRL reinforcement learning service. It enables:

- **Model Loading**: Load pre-trained RL models (PPO, SAC, A2C, TD3)
- **Prediction**: Request weight/action predictions from trained models
- **Health Checking**: Monitor service connectivity and model availability
- **Runtime Resilience**: Graceful fallback when predictions fail (hold weights)

## Standalone CLI Usage

```bash
# Check FinRL service health
cargo run --bin finrl_cli -- health

# List available models
cargo run --bin finrl_cli -- models

# Load a model
cargo run --bin finrl_cli -- load-model --model-id td3_v1

# Unload a model
cargo run --bin finrl_cli -- unload-model --model-id td3_v1

# Make a prediction
cargo run --bin finrl_cli -- predict \
  --model-id td3_v1 \
  --features "[1.02, 0.45, 0.012, 0.08, 1.2, ...]"

# Get model info
cargo run --bin finrl_cli -- model-info --model-id ppo_v1

# Check service version
cargo run --bin finrl_cli -- version
```

## API Integration

FinRL strategies use this tool internally via gRPC. No direct REST endpoints; used by:
- `finrl_ppo` strategy
- `finrl_sac` strategy
- `finrl_a2c` strategy
- `finrl_td3` strategy

## File Structure

```
backend/src/tools/finrl_integration/
├── mod.rs              # Module exports
├── core.rs             # gRPC client wrapper
├── client.rs           # Async gRPC communication
├── strategies/         # Strategy implementations using FinRL
│   ├── ppo.rs
│   ├── sac.rs
│   ├── a2c.rs
│   └── td3.rs
├── cli.rs              # Standalone CLI
├── tests.rs            # Unit & integration tests
└── README.md           # This file
```

## Core Types

```rust
pub struct FinRLClient {
    endpoint: String,
    client: FinrlServiceClient<Channel>,
}

pub struct PredictRequest {
    pub model_id: String,
    pub features: Vec<f64>,
    pub symbols: Vec<String>,
}

pub struct PredictResponse {
    pub weights: HashMap<String, f64>,  // symbol -> allocation weight
}

pub struct FinRLParams {
    pub symbols: Vec<String>,
    pub model_id: String,
    pub grpc_endpoint: String,
    pub rebalance_threshold_pct: f64,
    pub warmup_bars: usize,
}
```

## Supported Models

| Model | Type | Best For | Training Data |
|-------|------|----------|----------------|
| **PPO** | On-policy | Stable returns, moderate risk | 5+ years daily OHLCV |
| **SAC** | Off-policy | Exploration, sample efficiency | 3+ years daily OHLCV |
| **A2C** | On-policy | Fast training, good baselines | 5+ years daily OHLCV |
| **TD3** | Off-policy | Continuous actions, delayed updates | 5+ years daily OHLCV |

## Feature Engineering

Each bar produces a 5-feature vector per symbol (normalized):

```
[close_norm, rsi/100, (close-sma20)/close, atr/close, vol_ratio]
```

For 3 symbols (AAPL, MSFT, GOOGL):
```
[AAPL_5_features, MSFT_5_features, GOOGL_5_features] = 15 features total
```

The model is trained on this exact feature order and normalization.

## Runtime Behavior

### Successful Prediction
```
Bar i:
  1. Extract features
  2. Call gRPC predict
  3. Receive weights {AAPL: 0.4, MSFT: 0.35, GOOGL: 0.25}
  4. Rebalance portfolio
  5. Record trades
```

### Prediction Failure (Model Not Loaded)
```
Bar i:
  1. Extract features
  2. Call gRPC predict → ERROR: Model 'td3_v1' not loaded
  3. Log warning: "FinRL gRPC error at bar {i}: ... -- holding current weights"
  4. CONTINUE with current weights (no rebalance)
  5. NO TRADES generated this bar
  6. Equity curve continues from previous bar
```

### Key Characteristics
- **No Panic**: Strategy continues execution
- **Full Equity History**: All bars recorded (even with failures)
- **Conservative**: Holding weights avoids erratic behavior
- **Logged**: All failures tracked for diagnosis

## Runtime Validation Testing

Test coverage for gRPC failure scenarios:

```bash
# Run FinRL-specific tests
cargo test -p stratbench finrl_integration::tests

# Test repeated predict failures
cargo test -p stratbench finrl_integration::tests::finrl_grpc_runtime_validation_handles_repeated_predict_failures

# Output:
# - Verifies strategy completes despite unreachable gRPC endpoint
# - Confirms full equity curve maintained
# - Validates no trades placed during failures
```

## Testing

```bash
# Run all FinRL tests
cargo test -p stratbench finrl_integration

# Test gRPC client
cargo test -p stratbench finrl_integration::client::tests

# Test runtime resilience
cargo test -p stratbench finrl_integration::tests::resilience

# With output
cargo test -p stratbench finrl_integration -- --nocapture
```

## Common Patterns

### Use FinRL in Backtest
```bash
# 1. Strategy uses finrl_ppo parameters
cargo run --bin benchmarking_cli -- run \
  --strategy-id <finrl-ppo-uuid> \
  --start 2024-01-01 \
  --end 2024-12-31

# Assumes FinRL service is running:
# - docker-compose up finrl-service
```

### Debug Model Loading Issues
```bash
# 1. Check service health
cargo run --bin finrl_cli -- health

# 2. List available models
cargo run --bin finrl_cli -- models

# 3. Try loading specific model
cargo run --bin finrl_cli -- load-model --model-id td3_v1

# 4. If fails, check service logs
docker logs <finrl-container-id>
```

### Test Predictions Manually
```bash
# Create sample features (15 for 3 symbols)
FEATURES="[1.02, 0.45, 0.012, 0.08, 1.2, 1.05, 0.52, 0.008, 0.10, 1.1, 1.01, 0.48, 0.010, 0.09, 1.15]"

# Call predict
cargo run --bin finrl_cli -- predict \
  --model-id td3_v1 \
  --features "$FEATURES"

# Example output:
# AAPL: 0.40
# MSFT: 0.35
# GOOGL: 0.25
```

## Environment Variables

```bash
# gRPC endpoint for FinRL service
export FINRL_GRPC_ENDPOINT="http://finrl-service:50051"

# Or for local development:
export FINRL_GRPC_ENDPOINT="http://127.0.0.1:50051"

# Timeout for gRPC calls (milliseconds)
export FINRL_GRPC_TIMEOUT="5000"
```

## Docker Deployment

### Start FinRL Service
```bash
# From project root
docker-compose up finrl-service

# Or standalone (from python/)
docker build -f Dockerfile.finrl -t finrl-service .
docker run -p 50051:50051 finrl-service
```

### Health Check
```bash
# Inside container
cargo run --bin finrl_cli -- health

# Expected output:
# FinRL Service: OK
# Status: SERVING
```

## Troubleshooting

### "Model 'td3_v1' not loaded" (during benchmark)
```bash
# 1. Verify service is running
docker-compose ps | grep finrl

# 2. Check if model exists
cargo run --bin finrl_cli -- models

# 3. Attempt to load
cargo run --bin finrl_cli -- load-model --model-id td3_v1

# 4. Check service logs
docker-compose logs finrl-service | tail -20

# 5. If persistent, restart service
docker-compose restart finrl-service
```

### "gRPC connection refused"
```bash
# 1. Verify endpoint is correct
echo $FINRL_GRPC_ENDPOINT

# 2. Test connectivity
curl -v http://finrl-service:50051

# 3. Check Docker network
docker network ls
docker network inspect rust-trading-dashboard_default

# 4. Verify container is on network
docker inspect <finrl-container-id> | grep Networks
```

### Slow Predictions
```bash
# 1. Check model size
cargo run --bin finrl_cli -- model-info --model-id td3_v1 | grep size

# 2. Monitor gRPC latency
RUST_LOG=stratbench=debug cargo run --bin finrl_cli -- predict ... 2>&1 | grep latency

# 3. If service is bottleneck, consider scaling or lighter model
```

## Integration with Other Tools

### Tuning with FinRL
```bash
# 1. Create tuning job for FinRL model
cargo run --bin tuning_cli -- create-job \
  --strategy-id <finrl-uuid> \
  --mode llm \
  --objective sharpe_ratio \
  --models "td3_v1,ppo_v1"

# 2. Run benchmark with tuned parameters
cargo run --bin benchmarking_cli -- run \
  --strategy-id <finrl-uuid> \
  --from-tuning <job-uuid>
```

### Monitor FinRL in Paper Trading
```bash
# Simulate FinRL predictions in paper trading
# (Uses same gRPC integration as backtesting)

# Check account while running
cargo run --bin paper_trading_cli -- account
```

## Architecture Notes

- **gRPC**: Async streaming protocol for low-latency predictions
- **Feature Engineering**: Done in Rust; models trained on fixed feature set
- **Resilience**: Automatic fallback to holding weights on prediction failure
- **Logging**: All gRPC calls logged at debug level
- **Threading**: Predictions run in background thread to avoid blocking

## Performance Metrics

| Operation | Typical Latency |
|-----------|-----------------|
| Health check | < 10ms |
| Load model | 100-500ms |
| Single prediction | 5-50ms |
| Full bar (extract + predict + rebalance) | 10-100ms |

