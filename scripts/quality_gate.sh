#!/usr/bin/env bash
# Quality Gate - Matches GitHub Actions CI Pipeline
# Runs all validation checks that run in GitHub Actions
# Exit 0 on success, Exit 2 on failure

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

ERRORS=()
WARNINGS=()
DRIFT_DETECTED=false

# Pre-check: CI drift detection
# If .github/ci-status/ci-status.json exists and CI is failing, warn early
CI_STATUS_FILE="${ROOT_DIR}/.github/ci-status/ci-status.json"
if [ -f "$CI_STATUS_FILE" ]; then
    if grep -q '"overall":\s*"failure"' "$CI_STATUS_FILE" 2>/dev/null || \
       grep -q '"overall":\s*"failing"' "$CI_STATUS_FILE" 2>/dev/null; then
        DRIFT_DETECTED=true
        WARNINGS+=("⚠ CI drift detected: .github/ci-status/ci-status.json shows CI is failing")
        WARNINGS+=("  Local quality gate may pass while CI is broken. Verify CI status before merging.")
    fi
fi

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
    # Clean up any stale coverage artifacts before running tests
    # Prevents race conditions from parallel runs removing coverage dir mid-test
    rm -rf "${ROOT_DIR}/coverage"
    run_check "Unit tests" "npm run test:ci"
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
        if python3 -c "import yaml" >/dev/null 2>&1; then
            yaml_errors=0
            while IFS= read -r -d '' file; do
                if ! python3 -c "import sys, yaml; yaml.safe_load(open(sys.argv[1]))" "$file" 2>/dev/null; then
                    ERRORS+=("✗ YAML syntax error in: $file")
                    yaml_errors=$((yaml_errors + 1))
                fi
            done < <(find .github/workflows -name "*.yml" -print0 2>/dev/null)

            if [ $yaml_errors -gt 0 ]; then
                ERRORS+=("Install yamllint for better validation: pip install yamllint")
            fi
        else
            echo "⚠ YAML validation skipped: python3-yaml not installed; install yamllint"
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
    # Use --omit=dev per Cloudflare Workers best practice: devDependencies
    # (wrangler, miniflare, discord.js, etc.) are local tooling only and
    # never reach the production Worker bundle. See:
    # https://cheatsheetseries.owasp.org/cheatsheets/NPM_Security_Cheat_Sheet.html
    audit_output=$(npm audit --omit=dev --audit-level=moderate 2>&1 || true)
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

# Check 13: Dependabot configuration validation
run_check "Dependabot config" "${SCRIPT_DIR}/validate-dependabot.sh"

# Check 14: Shell unit tests (worker-host.sh resolution logic)
# Lightweight (~ < 1s) — guards against regressions in the hostname resolution
# helper used by every CI workflow that touches a deployed environment.
if [ -f "${ROOT_DIR}/tests/unit/worker-host.test.sh" ]; then
    run_check "Shell unit tests (worker-host.sh)" "bash ${ROOT_DIR}/tests/unit/worker-host.test.sh"
fi

# Check 15: Lines-of-code (LOC) enforcement
# Enforce MAX_LINES_PER_SOURCE_FILE (500) with warning at 500, fail at 600
LOC_WARNING_THRESHOLD=500
LOC_FAIL_THRESHOLD=600
loc_violations=0

while IFS= read -r -d '' file; do
    # Skip excluded directories
    case "$file" in
        ./.git/*|./dist/*|./coverage/*|./docs/*|./reports/*|./tests/*|./.agents/*|./.claude/*|./.opencode/*|./plans/*|./public/*|./node_modules/*) continue ;;
    esac

    line_count=$(wc -l < "$file" 2>/dev/null || echo 0)
    if [ "$line_count" -ge "$LOC_FAIL_THRESHOLD" ]; then
        ERRORS+=("✗ File exceeds ${LOC_FAIL_THRESHOLD} lines: $file ($line_count lines)")
        loc_violations=$((loc_violations + 1))
    elif [ "$line_count" -ge "$LOC_WARNING_THRESHOLD" ]; then
        WARNINGS+=("⚠ File approaching limit: $file ($line_count lines, limit ${LOC_FAIL_THRESHOLD})")
    fi
done < <(find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.sh" -o -name "*.md" \) -print0 2>/dev/null)

if [ $loc_violations -gt 0 ]; then
    ERRORS+=("Fix files exceeding ${LOC_FAIL_THRESHOLD} lines or increase MAX_LINES_PER_SOURCE_FILE in AGENTS.md")
fi

# Check 16.5: Error-shaping helpers gate
# Called with stdout to temp log file (not command substitution) because
# the script uses temp-file-based scanning incompatible with $(...) which
# can leak FDs and hang. See scripts/check-err-helpers.sh header.
echo "Running Error-shaping helpers gate..."
ERR_HELPERS_LOG=$(mktemp)
bash "${SCRIPT_DIR}/check-err-helpers.sh" > "$ERR_HELPERS_LOG" 2>&1 || err_helpers_exit=$?
if [ "${err_helpers_exit:-0}" -ne 0 ]; then
    ERRORS+=("✗ Error-shaping helpers gate failed (exit ${err_helpers_exit:-0})")
    ERRORS+=("$(cat "$ERR_HELPERS_LOG")")
fi
rm -f "$ERR_HELPERS_LOG"

# Check 17: Context efficiency (agent documentation size)
# Warn if AGENTS.md or SKILL.md files are oversized
AGENTS_MD_WARNING=200
SKILL_MD_WARNING=250

if [ -f "${ROOT_DIR}/AGENTS.md" ]; then
    agents_lines=$(wc -l < "${ROOT_DIR}/AGENTS.md" 2>/dev/null || echo 0)
    if [ "$agents_lines" -ge "$AGENTS_MD_WARNING" ]; then
        WARNINGS+=("⚠ AGENTS.md is $agents_lines lines (recommended max: ${AGENTS_MD_WARNING})")
        WARNINGS+=("  Large context files reduce agent efficiency. Consider moving details to agents-docs/.")
    fi
fi

while IFS= read -r -d '' skill_file; do
    skill_lines=$(wc -l < "$skill_file" 2>/dev/null || echo 0)
    if [ "$skill_lines" -ge "$SKILL_MD_WARNING" ]; then
        WARNINGS+=("⚠ $skill_file is $skill_lines lines (recommended max: ${SKILL_MD_WARNING})")
    fi
done < <(find . -path "*/skills/*/SKILL.md" -print0 2>/dev/null)

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

# Print warnings without failing
if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo ""
    echo "Quality Gate Warnings"
    echo "====================="
    for warning in "${WARNINGS[@]}"; do
        echo "$warning"
    done
fi

# CI status update hint (main branch only)
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo ""
    echo "Run \`./scripts/update-ci-status.sh\` to update CI status artifacts."
fi

# Success: Exit silently with code 0
exit 0
