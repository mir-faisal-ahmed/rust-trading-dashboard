#!/bin/bash
# Start all StratBench services locally (non-Docker dev mode)
# Usage: bash scripts/start_local.sh [--no-backend] [--no-finrl]
#
# Requires: .env in project root, python/.venv created by setup_finrl.sh

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NO_BACKEND=0
NO_FINRL=0
for arg in "$@"; do
  case $arg in
    --no-backend) NO_BACKEND=1 ;;
    --no-finrl)   NO_FINRL=1 ;;
  esac
done

# ── Load env ─────────────────────────────────────────────────────────────────
if [ -f ".env" ]; then
  set -a; source .env; set +a
  echo "  ✓ .env loaded"
else
  echo "  ✗ .env not found — copy from .env.example and fill in credentials"
  exit 1
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://stratbench:stratbench@localhost/stratbench}"
export RUST_LOG="${RUST_LOG:-info}"

# ── FinRL gRPC service ────────────────────────────────────────────────────────
if [ "$NO_FINRL" -eq 0 ]; then
  VENV="python/.venv/bin/python"
  if [ ! -f "$VENV" ]; then
    echo "  ✗ python/.venv not found — run: bash scripts/setup_finrl.sh"
    exit 1
  fi

  # Kill existing server
  pkill -f "finrl_server.py" 2>/dev/null || true
  sleep 1

  MODELS_DIR="${ROOT}/models"
  mkdir -p "$MODELS_DIR"

  MODELS_DIR="$MODELS_DIR" \
  PYTHONPATH="${ROOT}/python" \
    "$VENV" "${ROOT}/python/services/finrl_server.py" \
    > /tmp/finrl_server.log 2>&1 &
  FINRL_PID=$!

  # Wait for gRPC port
  for i in $(seq 1 10); do
    if nc -z localhost "${FINRL_GRPC_PORT:-50051}" 2>/dev/null; then
      echo "  ✓ FinRL gRPC server up (PID $FINRL_PID)"
      break
    fi
    sleep 1
  done
fi

# ── Rust backend ──────────────────────────────────────────────────────────────
if [ "$NO_BACKEND" -eq 0 ]; then
  BIN="${ROOT}/backend/target/release/stratbench"
  if [ ! -f "$BIN" ]; then
    echo "  Building backend..."
    (cd backend && cargo build --release 2>&1 | tail -3)
  fi

  pkill -f "stratbench" 2>/dev/null || true
  sleep 1

  "$BIN" > /tmp/backend.log 2>&1 &
  BACKEND_PID=$!

  # Wait for HTTP port
  for i in $(seq 1 10); do
    if curl -sf http://localhost:8080/api/v1/health >/dev/null 2>&1; then
      echo "  ✓ Backend up (PID $BACKEND_PID)"
      break
    fi
    sleep 1
  done
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Services running"
echo "═══════════════════════════════════════════"
echo "  API:   http://localhost:8080/api/v1/health"
echo "  gRPC:  localhost:${FINRL_GRPC_PORT:-50051}"
echo "  Logs:  tail -f /tmp/backend.log /tmp/finrl_server.log"
echo ""
echo "  Stop all: pkill -f stratbench; pkill -f finrl_server.py"
