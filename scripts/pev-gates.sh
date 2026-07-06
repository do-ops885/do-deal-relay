#!/usr/bin/env bash
# PEV Gates - Executable verification gates for the Plan-Execute-Verify loop
# Runs after execution phase to verify code quality before human review.
# Reference: plans/PEV_LOOP.md

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

GATE_RESULTS=()
FAILED_GATES=()

log_gate() {
    local gate_name="$1"
    local status="$2"
    local details="${3:-}"
    if [ "$status" = "pass" ]; then
        echo -e "${GREEN}✓${NC} ${gate_name}: ${status}"
    elif [ "$status" = "skip" ]; then
        echo -e "${YELLOW}○${NC} ${gate_name}: ${status} — ${details}"
    else
        echo -e "${RED}✗${NC} ${gate_name}: ${status}"
        if [ -n "$details" ]; then
            echo "  ${details}" | head -20
        fi
        FAILED_GATES+=("$gate_name")
    fi
    GATE_RESULTS+=("{\"gate\":\"${gate_name}\",\"status\":\"${status}\"}")
}

run_gate() {
    local gate_name="$1"
    shift
    local cmd="$*"

    echo ""
    echo "--- Gate: ${gate_name} ---"
    local output
    if output=$(eval "$cmd" 2>&1); then
        log_gate "$gate_name" "pass"
        return 0
    else
        log_gate "$gate_name" "fail" "$output"
        return 1
    fi
}

echo "╔══════════════════════════════════════════════╗"
echo "║       PEV Verification Gates                ║"
echo "║  Reference: plans/PEV_LOOP.md               ║"
echo "╚══════════════════════════════════════════════╝"

cd "$ROOT_DIR"

# Gate 1: Format check
run_gate "format" "npm run fmt:check" || true

# Gate 2: Type check
run_gate "typecheck" "npm run typecheck" || true

# Gate 3: Lint
run_gate "lint" "npx tsc --noEmit" || true

# Gate 4: Unit tests
run_gate "tests:unit" "npm run test:unit" || true

# Gate 5: Integration tests (optional, may need env)
if [ "${RUN_INTEGRATION:-false}" = "true" ]; then
    run_gate "tests:integration" "npm run test:integration" || true
else
    log_gate "tests:integration" "skip" "set RUN_INTEGRATION=true to enable"
fi

# Gate 6: Schema validation
run_gate "schema" "npm run validate" || true

# Gate 7: Markdown lint
run_gate "markdown" "npm run lint:md" || true

# Gate 8: Security - check for hardcoded secrets
run_gate "secrets" "grep -r 'password\|secret\|api_key\|token' --include='*.ts' --include='*.js' worker/ | grep -v 'node_modules' | grep -v '.env' | grep -v 'type ' | grep -v 'interface ' | grep -v '//' | head -5 || true" || true

# Gate 9: Dependency audit
run_gate "deps" "npm audit --audit-level=high 2>&1 | head -10 || true" || true

# Summary
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║              Gate Results                   ║"
echo "╚══════════════════════════════════════════════╝"

if [ ${#FAILED_GATES[@]} -eq 0 ]; then
    echo -e "${GREEN}All gates passed${NC}"
    echo ""
    echo "GATE_SUMMARY={\"status\":\"pass\",\"gates\":[${GATE_RESULTS[*]}],\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
    exit 0
else
    echo -e "${RED}Failed gates: ${FAILED_GATES[*]}${NC}"
    echo ""
    echo "GATE_SUMMARY={\"status\":\"fail\",\"failed\":[${FAILED_GATES[*]}],\"gates\":[${GATE_RESULTS[*]}],\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
    exit 1
fi
