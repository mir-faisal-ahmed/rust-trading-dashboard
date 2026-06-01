# FinRL Integration - Python Services

This directory contains:
- Forked FinRL framework for custom RL algorithm development
- gRPC server for model inference
- Custom RL agents and reward functions
- Optimized Redis caching layer

## Setup

### 1. Fork FinRL
```bash
bash scripts/fork_finrl.sh
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Start gRPC server
```bash
python services/finrl_server.py
```

## Architecture

```
Rust Engine <--gRPC--> Python FinRL Server <---> Redis Cache
                            |
                            +---> FinRL Models (PPO/SAC)
                            +---> Custom Agents
```

## Directory Structure

- `finrl/` - Forked FinRL framework (populated by fork script)
- `custom/` - Custom RL extensions
  - `agents/` - Custom RL agents (regime-aware, multi-agent, etc.)
  - `rewards/` - Custom reward functions (Sharpe, Calmar optimized)
  - `cache/` - Redis caching optimization
- `protos/` - gRPC protocol definitions
- `services/` - gRPC server implementation
- `scripts/` - Utility scripts
- `tests/` - Unit and integration tests

## Development Workflow

1. **Train model in Python:**
   ```bash
   python scripts/train_model.py --algorithm ppo --symbols AAPL,MSFT,GOOGL
   ```

2. **Export to ONNX (optional):**
   ```bash
   python scripts/export_onnx.py --checkpoint models/ppo_v1.zip --output models/ppo_v1.onnx
   ```

3. **Start gRPC server:**
   ```bash
   python services/finrl_server.py
   ```

4. **Run Rust backtests:**
   ```bash
   cd ../backend && cargo run --release
   ```

## Custom RL Development

See `custom/` directory for examples of:
- Custom reward functions for profitability optimization
- Regime-aware RL agents
- Multi-agent portfolio optimization
- Optimized Redis caching strategies
