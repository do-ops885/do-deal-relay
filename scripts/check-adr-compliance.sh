#!/usr/bin/env bash
# ============================================================================
# check-adr-compliance.sh — Automated ADR Compliance Check
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../" && pwd)"
EXIT_CODE=0

if [[ -f "$REPO_ROOT/.agents/config.sh" ]]; then
    source "$REPO_ROOT/.agents/config.sh"
else
    log_success() { echo "[PASS] $*"; }
    log_error() { echo "[ERROR] $*"; }
fi

log_ok() { log_success "$1"; }
log_fail() { log_error "$1"; EXIT_CODE=1; }

echo "=== Phase 1: ADR File Inventory ==="
declare -a ADR_FILES=()
while IFS= read -r -d '' file; do
  ADR_FILES+=("$(basename "$file")")
done < <(find "$REPO_ROOT/plans" -maxdepth 1 -name 'ADR-*.md' -print0 | sort -z)

for f in "${ADR_FILES[@]}"; do echo "  - $f"; done

echo -e "\n=== Phase 2: _status.json Registration ==="
STATUS_FILE="$REPO_ROOT/plans/_status.json"
if [[ ! -f "$STATUS_FILE" ]]; then
  if [[ ${#ADR_FILES[@]} -eq 0 ]]; then
    echo "  (Skipping check: plans/_status.json not found and no ADR files exist)"
  else
    log_fail "plans/_status.json not found but ADR files exist!"
  fi
else
  for f in "${ADR_FILES[@]}"; do
    if grep -q "\"$f\"" "$STATUS_FILE"; then
        log_ok "$f registered"
    else
        log_fail "$f NOT registered in _status.json"
    fi
  done
fi

if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "\n✓ All ADR compliance checks passed."
else
  echo -e "\n✗ ADR compliance issues found."
fi

exit $EXIT_CODE
