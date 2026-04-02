#!/usr/bin/env bash
# Quality Gate - Silent Success / Loud Failure Pattern
# Runs all validation checks
# Exit 0 (silent) on success, Exit 2 (loud) on failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

ERRORS=()
FAILED=0

# Function to run a check and capture output
run_check() {
    local name="$1"
    local cmd="$2"

    echo "Running: $name..."
    local output
    local exit_code=0

    # Run command and capture output
    output=$(eval "$cmd" 2>&1) || exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo "  ✗ $name failed (exit $exit_code)"
        ERRORS+=("✗ $name failed (exit $exit_code)")
        ERRORS+=("$output")
        FAILED=1
        return 1
    else
        echo "  ✓ $name passed"
    fi

    return 0
}

# Check 1: TypeScript compilation (silent on success)
run_check "TypeScript compilation" "npm run lint" || true

# Check 2: Unit tests (silent on success)
run_check "Unit tests" "npm run test:ci" || true

# Check 3: Validation gates
run_check "Validation gates" "npm run validate" || true

# Check 4: Skill symlinks intact (if .claude exists)
if [ -d ".claude" ]; then
    run_check "Skill symlinks" "${SCRIPT_DIR}/validate-skills.sh" || true
fi

# Check 5: Git hooks installed (only check locally, not in CI)
if [ -z "$CI" ] && [ ! -f ".git/hooks/pre-commit" ]; then
    ERRORS+=("✗ Git hooks not installed")
    ERRORS+=("Run: cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit")
    FAILED=1
fi

# If there are errors, output them and exit with failure
if [ $FAILED -ne 0 ]; then
    echo ""
    echo "Quality Gate Failed"
    echo "==================="
    echo ""

    for error in "${ERRORS[@]}"; do
        echo "$error"
        # Add blank line after each error block
        if [[ "$error" == ✗* ]]; then
            echo ""
        fi
    done

    exit 2
fi

echo ""
echo "✅ Quality Gate passed"

# Success: Exit silently with code 0
exit 0
