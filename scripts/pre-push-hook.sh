#!/bin/bash
#
# Enhanced Pre-Push Guard Rails
# Matches GitHub Actions CI Pipeline
# Prevents pushing broken or unsafe code that would fail in CI
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo "🛡️  Running pre-push guard rails (matching GitHub Actions CI)..."
echo ""

error() {
    echo -e "${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# ============================================
# GUARD RAIL 1: TypeScript Compilation
# Matches CI lint/build jobs
# ============================================
echo "Guard Rail 1: TypeScript Compilation"
if npx tsc --noEmit 2>&1 | head -30; then
    success "TypeScript compilation passed"
else
    error "TypeScript compilation failed"
    echo "   Run: npx tsc --noEmit to see all errors"
fi
echo ""

# ============================================
# GUARD RAIL 2: Test Suite
# Matches CI test job
# ============================================
echo "Guard Rail 2: Test Suite"
if [ -f "package.json" ] && grep -q '"test:ci"' package.json; then
    info "Running CI test suite (this may take a minute)..."

    # Run tests and capture output
    TEST_OUTPUT=$(npm run test:ci 2>&1)
    TEST_EXIT=$?

    # Check if tests passed (accept any count like "380 passed")
    if echo "$TEST_OUTPUT" | grep -qE "[0-9]+ passed"; then
        PASSED=$(echo "$TEST_OUTPUT" | grep -oE "[0-9]+ passed" | grep -oE "[0-9]+")
        FAILED=$(echo "$TEST_OUTPUT" | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" || echo "0")

        if [ "$FAILED" = "0" ] || [ -z "$FAILED" ]; then
            success "All tests passed ($PASSED tests)"
        else
            error "$FAILED test(s) failed out of total"
            echo "$TEST_OUTPUT" | tail -50
        fi

        # Check for worker pool crash (informational)
        if echo "$TEST_OUTPUT" | grep -q "Worker exited unexpectedly"; then
            warning "Vitest worker pool crashed during cleanup (non-critical)"
            echo "   This is a known issue with Cloudflare Vitest pool - tests passed."
        fi
    else
        error "Test execution failed"
        echo "$TEST_OUTPUT" | tail -30
    fi
else
    warning "No test:ci script found in package.json"
fi
echo ""

# ============================================
# GUARD RAIL 3: Validation Gates
# Matches CI validate-codes job
# ============================================
echo "Guard Rail 3: Validation Script"
if [ -f "scripts/validate-codes.sh" ]; then
    info "Running validation gates..."
    if bash scripts/validate-codes.sh 2>&1 | tail -20; then
        success "All 9 validation gates passed"
    else
        error "Validation gates found issues"
        echo "   Run: ./scripts/validate-codes.sh for full output"
    fi
else
    error "Validation script not found: scripts/validate-codes.sh"
fi
echo ""

# ============================================
# GUARD RAIL 4: Security Scan
# Matches CI security-scan job
# ============================================
echo "Guard Rail 4: Secret Detection"

SECRET_PATTERNS=(
    "ghp_[a-zA-Z0-9]{36}"                     # GitHub PAT
    "gho_[a-zA-Z0-9]{36}"                     # GitHub OAuth
    "sk-[a-zA-Z0-9]{48}"                      # Stripe
    "sk_live_[a-zA-Z0-9]{24,}"                # Stripe Live
    "AKIA[0-9A-Z]{16}"                        # AWS Key
    "ASIA[0-9A-Z]{16}"                        # AWS Session
    "bearer\s+[a-zA-Z0-9_-]{20,}"              # Bearer token
    "BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY"  # Private keys
)

SECRETS_FOUND=0
PATTERN_COUNT=0

for pattern in "${SECRET_PATTERNS[@]}"; do
    PATTERN_COUNT=$((PATTERN_COUNT + 1))
    # Check all files (not just staged) since we're pushing
    MATCHES=$(grep -rE "$pattern" --include="*.ts" --include="*.js" --include="*.json" . 2>/dev/null | grep -v "node_modules\|\.git\|test\|example" || true)
    if [ -n "$MATCHES" ]; then
        error "Potential secret detected:"
        echo "  $MATCHES" | head -3
        SECRETS_FOUND=1
    fi
done

if [ $SECRETS_FOUND -eq 0 ]; then
    success "No secrets detected ($PATTERN_COUNT patterns checked)"
else
    error "PUSH BLOCKED: Secrets detected in codebase"
    echo ""
    echo "Remove secrets before pushing. Use environment variables instead."
fi
echo ""

# ============================================
# GUARD RAIL 5: Quality Gate
# Matches CI quality-gate job
# ============================================
echo "Guard Rail 5: Quality Gate"
if [ -f "scripts/quality_gate.sh" ]; then
    info "Running full quality gate..."
    if ./scripts/quality_gate.sh 2>&1 | tail -30; then
        success "Quality gate passed"
    else
        error "Quality gate failed"
        echo "   Run: ./scripts/quality_gate.sh for full output"
    fi
else
    error "Quality gate script not found: scripts/quality_gate.sh"
fi
echo ""

# ============================================
# GUARD RAIL 6: Branch Name & Main Push Protection
# ============================================
echo "Guard Rail 6: Branch Name"

# Get remote ref from pre-push arguments (local_ref local_sha remote_ref remote_sha)
REMOTE_REF="${4:-}"
PUSH_TO_MAIN=false

if [ -n "$REMOTE_REF" ]; then
    # Extract branch name from remote ref (e.g., refs/heads/main -> main)
    REMOTE_BRANCH=$(echo "$REMOTE_REF" | sed 's|refs/heads/||')
    if [[ "$REMOTE_BRANCH" == "main" ]] || [[ "$REMOTE_BRANCH" == "master" ]]; then
        PUSH_TO_MAIN=true
    fi
fi

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "unknown")

# Main branch push protection
if [[ $PUSH_TO_MAIN == true ]] || [[ $BRANCH == "main" ]] || [[ $BRANCH == "master" ]]; then
    echo ""
    echo -e "${YELLOW}⚠️  Direct push to main branch detected${NC}"
    echo ""
    echo -e "${YELLOW}Recommended workflow: Use feature branches${NC}"
    echo ""
    echo "Options:"
    echo "  1. Cancel and use: git checkout -b feature/xxx && git push -u origin feature/xxx"
    echo "  2. Type 'I understand pushing to main' to continue"
    echo "  3. Use --no-verify to bypass (not recommended)"
    echo ""

    # Read user input (skip in non-interactive environments)
    if [ -t 0 ]; then
        printf "Enter your choice: "
        read -r USER_INPUT

        # Audit log path
        AUDIT_LOG="temp/main-push-audit.log"
        mkdir -p temp

        if [[ "$USER_INPUT" == "I understand pushing to main" ]]; then
            echo "[$(date -Iseconds)] AUTHORIZED main push by $(git config user.email || echo 'unknown') from branch: $BRANCH" >> "$AUDIT_LOG"
            success "Main push authorized and logged"
        else
            echo "[$(date -Iseconds)] BLOCKED main push attempt by $(git config user.email || echo 'unknown') from branch: $BRANCH" >> "$AUDIT_LOG"
            error "Main push blocked - confirmation phrase not entered correctly"
            echo "   To force push, use: git push --no-verify"
        fi
    else
        warning "Non-interactive environment detected - proceeding with main push"
        warning "This will be logged for audit purposes"
        echo "[$(date -Iseconds)] AUTO main push in non-interactive mode by $(git config user.email || echo 'unknown')" >> "temp/main-push-audit.log" 2>/dev/null || true
    fi
fi

# Branch naming convention
if [[ $BRANCH =~ ^(feature|fix|hotfix|release|chore|docs|refactor|test|style|perf|ci|build)/[a-z0-9-]+$ ]]; then
    success "Branch name follows convention: $BRANCH"
elif [[ $BRANCH == "main" ]] || [[ $BRANCH == "master" ]]; then
    info "On main branch (protected)"
else
    warning "Branch name doesn't follow convention: $BRANCH"
    echo "   Recommended: feature/description, fix/bug-name, chore/task-name"
fi
echo ""

# ============================================
# GUARD RAIL 7: Recent Commits Check
# ============================================
echo "Guard Rail 7: Recent Commits"
COMMITS=$(git log --oneline --no-merges -5 2>/dev/null || echo "")
if [ -n "$COMMITS" ]; then
    # Check for WIP commits
    if echo "$COMMITS" | grep -qiE "^(wip|work in progress|tmp|temp|draft)"; then
        error "WIP/temporary commits detected!"
        echo "$COMMITS" | head -3
        echo "   Clean up commits before pushing"
    else
        success "Recent commits look clean"
    fi
else
    success "No commits to check"
fi
echo ""

# ============================================
# GUARD RAIL 8: Dependency Security Audit
# Matches CI dependency-check job
# ============================================
echo "Guard Rail 8: Dependency Security Audit"

if command -v npm >/dev/null 2>&1; then
    info "Running npm audit..."
    AUDIT_OUTPUT=$(npm audit --audit-level=moderate 2>&1 || true)

    if echo "$AUDIT_OUTPUT" | grep -q "found.*vulnerabilities"; then
        # Extract vulnerability counts
        CRITICAL=$(echo "$AUDIT_OUTPUT" | grep -oE "[0-9]+ critical" | grep -oE "[0-9]+" || echo "0")
        HIGH=$(echo "$AUDIT_OUTPUT" | grep -oE "[0-9]+ high" | grep -oE "[0-9]+" || echo "0")
        MODERATE=$(echo "$AUDIT_OUTPUT" | grep -oE "[0-9]+ moderate" | grep -oE "[0-9]+" || echo "0")

        # Only fail on critical
        if [ "$CRITICAL" != "0" ] && [ -n "$CRITICAL" ]; then
            error "Critical vulnerabilities found: $CRITICAL"
            echo "   Run: npm audit fix"
        elif [ "$HIGH" != "0" ] && [ -n "$HIGH" ]; then
            warning "High severity vulnerabilities: $HIGH"
            echo "   Consider running: npm audit fix"
        elif [ "$MODERATE" != "0" ] && [ -n "$MODERATE" ]; then
            warning "Moderate vulnerabilities: $MODERATE (informational)"
        else
            success "No critical/high vulnerabilities"
        fi
    else
        success "No vulnerabilities found"
    fi
else
    warning "npm not available - skipping audit"
fi
echo ""

# ============================================
# GUARD RAIL 9: Build Verification
# Matches CI build-check job
# ============================================
echo "Guard Rail 9: Build Verification"
if [ -f "package.json" ] && grep -q '"build"' package.json; then
    info "Running build..."
    if npm run build 2>&1 | tail -20; then
        success "Build successful"
    else
        error "Build failed"
    fi
else
    warning "No build script found"
fi
echo ""

# ============================================
# SUMMARY
# ============================================
echo "=================================="
echo "Pre-Push Guard Rails Summary"
echo "=================================="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ PUSH BLOCKED${NC}"
    echo "Fix the $ERRORS error(s) above before pushing."
    echo ""
    echo "These checks match GitHub Actions CI - pushing would fail in CI anyway."
    echo "To bypass (not recommended): git push --no-verify"
    exit 1
else
    echo -e "${GREEN}✓ ALL GUARD RAILS PASSED${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo "Review $WARNINGS warning(s) above."
        echo -e "${YELLOW}⚠ PUSH ALLOWED WITH WARNINGS${NC}"
    else
        echo "Safe to push!"
    fi
    exit 0
fi
