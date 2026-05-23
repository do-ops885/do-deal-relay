#!/usr/bin/env bash
# ============================================================================
# check-plan-numbering.sh — Verifies plan/ADR numbering consistency.
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../" && pwd)"
EXIT_CODE=0

if [[ -f "$REPO_ROOT/.agents/config.sh" ]]; then
    source "$REPO_ROOT/.agents/config.sh"
fi

STATUS_FILE="$REPO_ROOT/plans/_status.json"
README_FILE="$REPO_ROOT/plans/README.md"

if [[ ! -f "$STATUS_FILE" ]] || [[ ! -f "$README_FILE" ]]; then
  echo "  (Skipping check: plans/_status.json or plans/README.md not found)"
  exit 0
fi

# Use jq for robust JSON parsing
NEXT_PLAN=$(jq -r '.nextAvailable.plan' "$STATUS_FILE")
NEXT_ADR=$(jq -r '.nextAvailable.adr' "$STATUS_FILE")

echo "→ Checking plan numbering..."

# Simple regex extraction for README
README_NEXT_PLAN=$(grep -oE 'Next available plan number.*\`([0-9]+)\`' "$README_FILE" | grep -oE '[0-9]+' | head -1 || echo "")

if [[ -n "$README_NEXT_PLAN" ]] && [[ "$NEXT_PLAN" != "$README_NEXT_PLAN" ]]; then
  echo "  ✗ Plan number mismatch: _status.json says $NEXT_PLAN, README says $README_NEXT_PLAN"
  EXIT_CODE=1
fi

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "  ✓ Plan numbering consistent"
fi

exit $EXIT_CODE
