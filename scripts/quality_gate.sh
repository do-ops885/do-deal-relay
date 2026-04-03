#!/usr/bin/env bash
# Quality Gate - Matches GitHub Actions CI Pipeline
# Runs all validation checks that run in GitHub Actions
# Exit 0 on success, Exit 2 on failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

ERRORS=()

# Function to run a check and capture output
run_check() {
    local name="$1"
    local cmd="$2"

    local output
    local exit_code=0

    # Run command and capture output
    output=$(eval "$cmd" 2>&1) || exit_code=$?

    if [ $exit_code -ne 0 ]; then
        ERRORS+=("✗ $name failed (exit $exit_code)")
        ERRORS+=("$output")
        return 1
    fi

    return 0
}

# Check 1: TypeScript compilation (matches CI lint job)
run_check "TypeScript compilation" "npm run lint"

# Check 2: Unit tests (matches CI test job) - skip if SKIP_TESTS is set
if [ -z "${SKIP_TESTS:-}" ]; then
    run_check "Unit tests" "${SCRIPT_DIR}/run-tests-ci.sh"
fi

# Check 3: Validation gates (matches CI validate-codes job)
run_check "Validation gates" "npm run validate"

# Check 4: Directory organization
run_check "Directory organization" "${SCRIPT_DIR}/check-directory-organization.sh"

# Check 5: Build check (matches CI build-check job)
run_check "Build check" "npm run build"

# Check 6: Prettier format check (matches CI lint job)
# Check only files we care about, excluding generated files
if ! npx prettier --check .github/workflows/ worker/ tests/ scripts/ docs/ agents-docs/ 2>/dev/null; then
    ERRORS+=("✗ Code formatting check failed")
    ERRORS+=("Run: npx prettier --write .github/workflows/ worker/ tests/ scripts/ docs/ agents-docs/")
fi

# Check 7: YAML syntax validation (matches yaml-lint job)
# Check if yamllint is available
if command -v yamllint >/dev/null 2>&1; then
    # Run yamllint but only capture errors, not warnings
    yamllint_output=$(yamllint -d "{extends: default, rules: {line-length: {max: 120}, indentation: {spaces: 2}, document-start: disable, comments: {min-spaces-from-content: 1}}}" .github/ 2>&1) || yamllint_exit=$?
    # Only fail if there are actual errors (not just warnings)
    if echo "$yamllint_output" | grep -qE "^\[error\]"; then
        ERRORS+=("✗ YAML syntax validation failed")
        ERRORS+=("$yamllint_output")
    fi
else
    # Fallback: Basic YAML syntax check with Python
    if command -v python3 >/dev/null 2>&1; then
        yaml_errors=0
        while IFS= read -r -d '' file; do
            if ! python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then
                ERRORS+=("✗ YAML syntax error in: $file")
                yaml_errors=$((yaml_errors + 1))
            fi
        done < <(find .github/workflows -name "*.yml" -print0 2>/dev/null)

        if [ $yaml_errors -gt 0 ]; then
            ERRORS+=("Install yamllint for better validation: pip install yamllint")
        fi
    fi
fi

# Check 8: GitHub Actions workflow validation (matches actionlint in yaml-lint job)
# Check if actionlint is available
if command -v actionlint >/dev/null 2>&1; then
    if ! actionlint .github/workflows/*.yml 2>&1; then
        ERRORS+=("✗ GitHub Actions workflow validation failed")
    fi
else
    # Fallback: Basic workflow syntax checks
    workflow_errors=0
    for workflow in .github/workflows/*.yml; do
        if [ -f "$workflow" ]; then
            # Check for common issues
            if grep -q "uses: actions/checkout@v5" "$workflow" 2>/dev/null; then
                # v5 doesn't exist, should be v4
                ERRORS+=("✗ Invalid action version in $workflow: actions/checkout@v5 (use v4)")
                workflow_errors=$((workflow_errors + 1))
            fi
        fi
    done
fi

# Check 9: Security scan - Secret detection (matches CI security-scan job)
# Only check source files, exclude workflows and generated files
secrets_found=0

# Pattern 1: Variable/property assignments with string values (potential hardcoded secrets)
# shellcheck disable=SC2016
PATTERN1_OUTPUT=$(grep -rE '(api[_-]?key|password|secret)\s*[=:]\s*["'\''"'\'''][^"'\''"'\''"]{8,}["'\''"'\''"]' \
    --include="*.ts" --include="*.js" worker/ tests/ scripts/ 2>/dev/null | \
    grep -v "node_modules\|\.env\|test\|example\|\.d\.ts\|// \|/\*\|type\|interface\|: string\|: Secret" || true)
if [ -n "$PATTERN1_OUTPUT" ]; then
    ERRORS+=("✗ Potential hardcoded secrets found (assignments with values)")
    secrets_found=$((secrets_found + 1))
fi

# Pattern 2: High-entropy strings that look like tokens/keys
PATTERN2_OUTPUT=$(grep -rE '(bearer\s+[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|AKIA[0-9A-Z]{16})' \
    --include="*.ts" --include="*.js" worker/ tests/ scripts/ 2>/dev/null | \
    grep -v "node_modules\|\.env\|test\|example" || true)
if [ -n "$PATTERN2_OUTPUT" ]; then
    ERRORS+=("✗ Potential API tokens found")
    secrets_found=$((secrets_found + 1))
fi

# Pattern 3: Private keys (critical)
PATTERN3_OUTPUT=$(grep -rE '(BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY|BEGIN PGP PRIVATE)' \
    --include="*.ts" --include="*.js" --include="*.pem" --include="*.key" \
    worker/ tests/ scripts/ 2>/dev/null | \
    grep -v "node_modules\|\.env\|test\|example" || true)
if [ -n "$PATTERN3_OUTPUT" ]; then
    ERRORS+=("❌ Private keys found - CRITICAL SECURITY ISSUE")
    secrets_found=$((secrets_found + 1))
fi

# Check 10: Dependency audit (matches security.yml dependency-check job)
# Note: This is informational only - matches CI behavior (continue-on-error)
if command -v npm >/dev/null 2>&1; then
    audit_output=$(npm audit --audit-level=moderate 2>&1 || true)
    if echo "$audit_output" | grep -q "found.*vulnerabilities"; then
        vuln_count=$(echo "$audit_output" | grep -oE "[0-9]+\s+(low|moderate|high|critical)" | head -1)
        # Only fail if critical vulnerabilities found
        if echo "$audit_output" | grep -q "critical"; then
            ERRORS+=("✗ Critical security vulnerabilities found in dependencies")
            ERRORS+=("Run: npm audit fix")
        fi
    fi
fi

# Check 11: Skill symlinks intact (if .claude exists)
if [ -d ".claude" ]; then
    run_check "Skill symlinks" "${SCRIPT_DIR}/validate-skills.sh"
fi

# Check 12: Git hooks installed (skip in CI - hooks are for local dev only)
if [ -z "${SKIP_TESTS:-}" ] && [ -z "${GITHUB_ACTIONS:-}" ] && [ ! -f ".git/hooks/pre-commit" ]; then
    ERRORS+=("✗ Git hooks not installed")
    ERRORS+=("Run: cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit")
fi

# If there are errors, output them and exit with failure
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo ""
    echo "Quality Gate Failed"
    echo "==================="
    echo ""

    for error in "${ERRORS[@]}"; do
        echo "$error"
        # Add blank line after each error block
        if [[ "$error" == ✗* ]] || [[ "$error" == ❌* ]]; then
            echo ""
        fi
    done

    echo "Summary: ${#ERRORS[@]} issue(s) found"
    echo "Fix the errors above before pushing to GitHub."

    exit 2
fi

# Success: Exit silently with code 0
exit 0
