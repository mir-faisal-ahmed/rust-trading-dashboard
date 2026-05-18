#!/bin/bash
# Download and setup FinRL fork

set -e

FINRL_REPO="https://github.com/AI4Finance-Foundation/FinRL-Trading.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$SCRIPT_DIR/../finrl"

echo "═══════════════════════════════════════"
echo "  FinRL Fork Setup"
echo "═══════════════════════════════════════"
echo ""
echo "Forking FinRL into $TARGET_DIR..."

# Clone FinRL
git clone --depth 1 $FINRL_REPO temp_finrl

# Copy source (exclude .git)
mkdir -p "$TARGET_DIR"
cp -r temp_finrl/finrl "$TARGET_DIR/"

# Copy examples if they exist
if [ -d "temp_finrl/examples" ]; then
    cp -r temp_finrl/examples "$TARGET_DIR/examples"
fi

# Copy license and readme
cp temp_finrl/LICENSE "$TARGET_DIR/"
cp temp_finrl/README.md "$TARGET_DIR/README_UPSTREAM.md"

# Cleanup
rm -rf temp_finrl

# Add attribution
cat > "$TARGET_DIR/README.md" <<EOF
# FinRL Fork

Forked from: $FINRL_REPO
Fork date: $(date)
License: MIT (see LICENSE)

This is a vendor fork for custom RL algorithm development.
We modify this code heavily for production use and profitability optimization.

Original README: README_UPSTREAM.md

## Modifications

This fork includes:
- Custom reward functions optimized for Sharpe/Calmar ratios
- Regime-aware RL agents (bull/bear/sideways)
- Multi-agent portfolio optimization
- Optimized Redis caching layer
- gRPC integration for Rust execution engine

## Directory Structure

- \`finrl/\` - Original FinRL code (may be modified)
- \`../custom/\` - Our custom extensions
- \`../services/\` - gRPC server for model inference

## Development

See \`../README.md\` for setup and development workflow.
EOF

echo ""
echo "✓ FinRL forked successfully to $TARGET_DIR"
echo ""
echo "Next steps:"
echo "  1. cd $(dirname $SCRIPT_DIR)"
echo "  2. pip install -r requirements.txt"
echo "  3. Review finrl/README_UPSTREAM.md for FinRL documentation"
echo "  4. python services/finrl_server.py  # Start gRPC server"
