#!/usr/bin/env bash
# Example: Start a Jules session and verify repository context
# Usage: bash examples/start-session.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== jules-usage Skill Example ==="
echo ""

# Step 1: Verify gh CLI is installed and authenticated
echo "1. Checking GitHub CLI..."
if command -v gh >/dev/null 2>&1; then
  gh auth status 2>&1 | head -2
else
  echo "   gh CLI not found - install from https://cli.github.com/"
fi
echo ""

# Step 2: Get repository info
echo "2. Repository info:"
if command -v gh >/dev/null 2>&1; then
  gh repo view --json nameWithOwner,defaultBranchRef --jq '.nameWithOwner + " (default branch: " + .defaultBranchRef.name + ")"'
fi
echo ""

# Step 3: Check Jules CLI availability
echo "3. Checking Jules CLI..."
if command -v jules >/dev/null 2>&1; then
  echo "   Jules CLI is available at $(command -v jules)"
  jules --help | head -5
else
  echo "   Jules CLI not found."
  echo "   Install: npm install -g @jules/cli"
fi
echo ""

# Step 4: Run the skill's shell tests
echo "4. Running skill test suite..."
python "$SKILL_DIR/scripts/test.py" 2>&1 | tail -5
echo ""

echo "=== Example complete ==="
