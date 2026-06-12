#!/bin/bash
# bootstrap.sh - One-command setup for agents.
set -e

echo "--- [Bootstrap] Initializing agent environment ---"

# 1. Install dependencies (if needed)
if [ ! -d "node_modules" ]; then
  echo "[1/4] Installing dependencies..."
  npm install
else
  echo "[1/4] Dependencies already installed."
fi

# 2. Setup skills (symlinks)
echo "[2/4] Setting up skills..."
./scripts/setup-skills.sh

# 3. Install git hooks
echo "[3/4] Installing git hooks..."
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# 4. Run initial quality gate
echo "[4/4] Running initial quality gate..."
SKIP_TESTS=1 ./scripts/quality_gate.sh

echo "--- [Bootstrap] Environment ready ---"
./scripts/doctor.sh
