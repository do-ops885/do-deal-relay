#!/usr/bin/env bash
# Local pre-push verification script
# Runs the same checks as CI, but locally
# Exit 0 on success, non-zero on failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

echo "================================"
echo "Local Verification"
echo "================================"
echo ""

PASSED=0
FAILED=0

run_check() {
    local name="$1"
    local cmd="$2"

    printf "[%s] %s... " "$(date +%H:%M:%S)" "$name"
    if eval "$cmd" > /dev/null 2>&1; then
        echo "OK"
        PASSED=$((PASSED + 1))
    else
        echo "FAILED"
        eval "$cmd" 2>&1 | tail -5
        echo ""
        FAILED=$((FAILED + 1))
    fi
}

run_check "Type check" "npm run typecheck"
run_check "Format check" "npm run fmt:check"
run_check "Unit tests" "npm run test:ci"
run_check "Build" "npm run build"

echo ""
echo "================================"
echo "Results: $PASSED passed, $FAILED failed"
echo "================================"

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
echo "All checks passed!"
exit 0
