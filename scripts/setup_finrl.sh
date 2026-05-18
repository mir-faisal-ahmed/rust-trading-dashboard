#!/bin/bash
# Complete FinRL integration setup
# Run from the project root: bash scripts/setup_finrl.sh

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "═══════════════════════════════════════════"
echo "  FinRL Integration Setup"
echo "═══════════════════════════════════════════"

# ── 1. Fork FinRL ──────────────────────────────────────────────────────────
echo ""
echo "Step 1/5 — Forking FinRL..."
if [ -d "python/finrl/finrl" ]; then
    echo "  ✓ FinRL already forked — skipping"
else
    bash python/scripts/fork_finrl.sh
fi

# ── 2. Python virtual environment ─────────────────────────────────────────
echo ""
echo "Step 2/5 — Python virtual environment..."
if [ ! -d "python/.venv" ]; then
    python3 -m venv python/.venv
    echo "  ✓ Created python/.venv"
else
    echo "  ✓ venv already exists — skipping"
fi

source python/.venv/bin/activate

# ── 3. Install Python dependencies ────────────────────────────────────────
echo ""
echo "Step 3/5 — Installing Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet -r python/requirements.txt
echo "  ✓ Dependencies installed"

# ── 4. Compile protobuf stubs ─────────────────────────────────────────────
echo ""
echo "Step 4/5 — Compiling gRPC stubs..."
python -m grpc_tools.protoc \
    -I./python/protos \
    --python_out=./python/services \
    --grpc_python_out=./python/services \
    ./python/protos/finrl_service.proto
echo "  ✓ Protobuf stubs compiled to python/services/"

# ── 5. Environment file ────────────────────────────────────────────────────
echo ""
echo "Step 5/5 — Environment file..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  ✓ Created .env from .env.example"
    echo "  ! Edit .env and add your ALPACA_API_KEY / ALPACA_API_SECRET"
else
    # Append FinRL vars if missing
    if ! grep -q "FINRL_GRPC_ENDPOINT" .env; then
        echo "" >> .env
        echo "# FinRL gRPC Service" >> .env
        echo "FINRL_GRPC_ENDPOINT=http://localhost:50051" >> .env
        echo "REDIS_URL=redis://localhost:6379" >> .env
        echo "  ✓ Added FinRL vars to existing .env"
    else
        echo "  ✓ .env already has FinRL config"
    fi
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Setup complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "  Development (local):"
echo "    1. source python/.venv/bin/activate"
echo "    2. python python/services/finrl_server.py    # start FinRL service"
echo "    3. cd backend && cargo run                   # start Rust backend"
echo ""
echo "  Docker (all services):"
echo "    docker-compose up -d"
echo "    docker-compose logs -f finrl-service         # watch FinRL logs"
echo ""
echo "  Train your first model:"
echo "    python python/scripts/train_model.py \\"
echo "      --algorithm ppo \\"
echo "      --symbols AAPL,MSFT,GOOGL \\"
echo "      --output models/ppo_v1"
echo ""
echo "  See python/README.md for full development guide."
