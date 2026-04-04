#!/usr/bin/env bash
#
# Enhanced Pre-Commit Guard Rails
# Matches GitHub Actions CI Pipeline
# Install: cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
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

echo "🛡️  Running pre-commit guard rails (matching GitHub Actions CI)..."
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

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)

if [ -z "$STAGED_FILES" ]; then
    info "No files staged for commit"
    exit 0
fi

# Count staged files
STAGED_COUNT=$(echo "$STAGED_FILES" | wc -l | tr -d ' ')
info "Checking ${STAGED_COUNT} staged file(s)..."
echo ""

# ============================================
# GUARD RAIL 1: Blocked File Patterns
# ============================================
echo "Guard Rail 1: Blocked File Patterns"
BLOCKED_PATTERNS=(
    "*.env*"
    "*.key"
    "*.pem"
    "*.p12"
    "*.pfx"
    "*secret*"
    "*password*"
    "*credential*"
    "node_modules/"
    "coverage/"
    "dist/"
    "build/"
)

BLOCKED_FOUND=0
for pattern in "${BLOCKED_PATTERNS[@]}"; do
    if echo "$STAGED_FILES" | grep -qE "${pattern//\*/.*}"; then
        error "Attempting to commit blocked pattern: $pattern"
        BLOCKED_FOUND=1
    fi
done

if [ $BLOCKED_FOUND -eq 0 ]; then
    success "No blocked file patterns found"
fi
echo ""

# ============================================
# GUARD RAIL 2: Secret Detection in Staged Changes
# ============================================
echo "Guard Rail 2: Secret Detection"

SECRETS_FOUND=0
PATTERN_COUNT=0

# Define secret patterns as individual checks to avoid bash array issues
check_pattern() {
    local pattern="$1"
    local name="$2"
    PATTERN_COUNT=$((PATTERN_COUNT + 1))

    # Check staged diff for secrets, but exclude:
    # - Comment lines (starting with # or // or *)
    # - Lines containing "check_pattern" (function calls)
    # - Lines that are clearly documentation
    local MATCHES
    MATCHES=$(git diff --cached 2>/dev/null | \
        grep -vE "^[-+@ ]*(#|//|\*|--|<!--)" | \
        grep -v "check_pattern" | \
        grep -vE "^\s*-\s*" | \
        grep -vE "https?://" | \
        grep -vE "dash\.cloudflare\.com" | \
        grep -E "$pattern" || true)
    if [ -n "$MATCHES" ]; then
        error "Potential secret detected ($name):"
        echo "  $MATCHES" | head -3
        SECRETS_FOUND=1
    fi
}

# GitHub tokens
check_pattern "ghp_[a-zA-Z0-9]{36}" "GitHub PAT"
check_pattern "gho_[a-zA-Z0-9]{36}" "GitHub OAuth"
check_pattern "ghs_[a-zA-Z0-9]{36}" "GitHub Server-to-Server"

# Stripe keys
check_pattern "sk-[a-zA-Z0-9]{48}" "Stripe Secret"
check_pattern "sk_live_[a-zA-Z0-9]{24,}" "Stripe Live"
check_pattern "sk_test_[a-zA-Z0-9]{24,}" "Stripe Test"

# AWS keys
check_pattern "AKIA[0-9A-Z]{16}" "AWS Access Key"
check_pattern "ASIA[0-9A-Z]{16}" "AWS Session"

# Generic patterns
check_pattern "[A-Za-z0-9/+=]{40}" "Generic base64 secret"
check_pattern "bearer\s+[a-zA-Z0-9_-]{20,}" "Bearer token"

# Assignment patterns
check_pattern "api[_-]?key\s*[=:]\s*[\"'][^\"']{8,}[\"']" "API key assignment"
check_pattern "password\s*[=:]\s*[\"'][^\"']{8,}[\"']" "Password assignment"
check_pattern "secret\s*[=:]\s*[\"'][^\"']{8,}[\"']" "Secret assignment"

# Private keys (escaped parentheses for bash compatibility)
check_pattern "BEGIN \(RSA\|EC\|DSA\|OPENSSH\) PRIVATE KEY" "Private key"
check_pattern "BEGIN PGP PRIVATE KEY" "PGP key"

if [ $SECRETS_FOUND -eq 0 ]; then
    success "No secrets detected ($PATTERN_COUNT patterns checked)"
else
    error "COMMIT BLOCKED: Secrets detected in staged changes"
    echo ""
    echo "If these are false positives:"
    echo "  1. Use environment variables for secrets"
    echo "  2. Add to .env.example (not .env)"
    echo "  3. Use git commit --no-verify (not recommended)"
fi
echo ""

# ============================================
# GUARD RAIL 3: File Size Limits
# ============================================
echo "Guard Rail 3: File Size Limits"
MAX_SIZE=$((10 * 1024 * 1024))  # 10MB
MAX_SIZE_MB="10MB"

OVERSIZED=0
while IFS= read -r file; do
    if [ -f "$file" ]; then
        SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
        if [ "$SIZE" -gt "$MAX_SIZE" ]; then
            SIZE_MB=$(echo "scale=2; $SIZE / 1024 / 1024" | bc)
            error "File exceeds size limit ($MAX_SIZE_MB): $file (${SIZE_MB}MB)"
            OVERSIZED=1
        fi
    fi
done <<< "$STAGED_FILES"

if [ $OVERSIZED -eq 0 ]; then
    success "All files within size limits"
fi
echo ""

# ============================================
# GUARD RAIL 4: Line Count Limits
# ============================================
echo "Guard Rail 4: Line Count Limits"
MAX_LINES_TS=500
MAX_LINES_SKILL=250
MAX_LINES_AGENTS=150

LINE_VIOLATIONS=0
while IFS= read -r file; do
    if [ -f "$file" ]; then
        LINES=$(wc -l < "$file")

        # TypeScript/JavaScript files
        if [[ "$file" == *.ts ]] || [[ "$file" == *.js ]]; then
            if [ "$LINES" -gt $MAX_LINES_TS ]; then
                warning "$file has $LINES lines (max $MAX_LINES_TS)"
                LINE_VIOLATIONS=$((LINE_VIOLATIONS + 1))
            fi
        fi

        # SKILL.md files
        if [[ "$file" == */SKILL.md ]]; then
            if [ "$LINES" -gt $MAX_LINES_SKILL ]; then
                warning "$file has $LINES lines (max $MAX_LINES_SKILL)"
                LINE_VIOLATIONS=$((LINE_VIOLATIONS + 1))
            fi
        fi

        # AGENTS.md
        if [[ "$file" == "AGENTS.md" ]]; then
            if [ "$LINES" -gt $MAX_LINES_AGENTS ]; then
                warning "AGENTS.md has $LINES lines (max $MAX_LINES_AGENTS)"
                LINE_VIOLATIONS=$((LINE_VIOLATIONS + 1))
            fi
        fi
    fi
done <<< "$STAGED_FILES"

if [ $LINE_VIOLATIONS -eq 0 ]; then
    success "Line count check complete"
else
    warning "$LINE_VIOLATIONS file(s) exceed line limit (warnings only)"
fi
echo ""

# ============================================
# GUARD RAIL 5: Dependency/Build Directory Check
# ============================================
echo "Guard Rail 5: Dependency Directory Check"
DEPS_STAGED=0

while IFS= read -r file; do
    case "$file" in
        node_modules/*|vendor/*|dist/*|build/*|coverage/*|.next/*|.nuxt/*)
            error "Dependency/build file staged: $file"
            DEPS_STAGED=1
            ;;
    esac
done <<< "$STAGED_FILES"

if [ $DEPS_STAGED -eq 0 ]; then
    success "No dependency/build files staged"
fi
echo ""

# ============================================
# GUARD RAIL 6: Code Quality (TypeScript + Tests)
# ============================================
echo "Guard Rail 6: Code Quality"

# TypeScript compilation
if echo "$STAGED_FILES" | grep -qE "\.(ts|tsx|js|jsx)$"; then
    info "TypeScript/JavaScript files changed - running checks..."

    # TypeScript compilation check
    if npx tsc --noEmit 2>&1 | head -20; then
        success "TypeScript compilation passed"
    else
        error "TypeScript compilation failed"
        echo "   Run: npx tsc --noEmit"
    fi

    # Run affected tests only (quick mode)
    if [ -f "package.json" ] && grep -q '"test"' package.json; then
        info "Running tests..."
        if npm run test:ci 2>&1 | tail -20 | grep -q "passed"; then
            success "Tests passing"
        else
            error "Tests failed - run 'npm run test:ci' for details"
        fi
    fi
else
    success "No TypeScript/JavaScript changes (skipping)"
fi
echo ""

# ============================================
# GUARD RAIL 7: JSON/YAML Syntax Validation
# ============================================
echo "Guard Rail 7: Syntax Validation"

JSON_ERRORS=0
YAML_ERRORS=0

# Check JSON files
while IFS= read -r file; do
    if [[ "$file" == *.json ]]; then
        if ! python3 -c "import json; json.load(open('$file'))" 2>/dev/null; then
            error "Invalid JSON syntax: $file"
            JSON_ERRORS=1
        fi
    fi
done <<< "$STAGED_FILES"

# Check YAML files
while IFS= read -r file; do
    if [[ "$file" == *.yml ]] || [[ "$file" == *.yaml ]]; then
        if ! python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then
            error "Invalid YAML syntax: $file"
            YAML_ERRORS=1
        fi
    fi
done <<< "$STAGED_FILES"

if [ $JSON_ERRORS -eq 0 ] && [ $YAML_ERRORS -eq 0 ]; then
    success "All JSON/YAML files are valid"
fi
echo ""

# ============================================
# GUARD RAIL 8: Root Directory File Organization
# ============================================
echo "Guard Rail 8: Root Directory File Organization"

ALLOWED_ROOT_FILES=(
    "AGENTS.md"
    "README.md"
    "LICENSE"
    "package.json"
    "package-lock.json"
    "tsconfig.json"
    "vitest.config.ts"
    "wrangler.jsonc"
    "wrangler.toml"
    "VERSION"
    ".gitignore"
    ".gitattributes"
    ".editorconfig"
    ".prettierrc"
    ".prettierignore"
    ".eslintrc*"
    ".nvmrc"
    ".node-version"
    "Dockerfile"
    "docker-compose.yml"
    "Makefile"
    ".codesandbox"
    ".devcontainer"
)

ROOT_VIOLATIONS=0
while IFS= read -r file; do
    # Check if file is in root directory
    if [[ "$file" != */* ]] && [ -f "$file" ]; then
        # Check if it's in allowed list (with wildcard support)
        ALLOWED=0
        for allowed in "${ALLOWED_ROOT_FILES[@]}"; do
            if [[ "$file" == $allowed ]]; then
                ALLOWED=1
                break
            fi
        done

        if [ $ALLOWED -eq 0 ]; then
            error "File in root directory not in allowed list: $file"
            ROOT_VIOLATIONS=1
        fi
    fi
done <<< "$STAGED_FILES"

if [ $ROOT_VIOLATIONS -eq 0 ]; then
    success "Root directory organization is valid"
fi
echo ""

# ============================================
# GUARD RAIL 9: Directory Organization
# ============================================
echo "Guard Rail 9: Directory Organization"

# Check for misplaced files
MISPLACED=0

while IFS= read -r file; do
    # Documentation should be in docs/ or agents-docs/
    if [[ "$file" == *.md ]] && [[ "$file" != "README.md" ]] && [[ "$file" != "AGENTS.md" ]] && [[ "$file" != "LICENSE" ]]; then
        if [[ "$file" != docs/* ]] && [[ "$file" != agents-docs/* ]]; then
            warning "Markdown file outside docs/: $file"
            MISPLACED=1
        fi
    fi

    # Scripts should be in scripts/
    if [[ "$file" == *.sh ]]; then
        if [[ "$file" != scripts/* ]]; then
            error "Shell script outside scripts/: $file"
            MISPLACED=1
        fi
    fi
done <<< "$STAGED_FILES"

if [ $MISPLACED -eq 0 ]; then
    success "Directory organization is valid"
fi
echo ""

# ============================================
# GUARD RAIL 10: GitHub Actions Workflow Validation
# ============================================
echo "Guard Rail 10: GitHub Actions Workflow Validation"

if echo "$STAGED_FILES" | grep -q ".github/workflows"; then
    info "Workflow files changed - validating..."

    # Check if actionlint is available
    if command -v actionlint >/dev/null 2>&1; then
        if actionlint .github/workflows/*.yml 2>&1; then
            success "Workflow validation passed (actionlint)"
        else
            error "Workflow validation failed (actionlint)"
        fi
    else
        warning "actionlint not installed - skipping workflow validation"
        echo "   Install: go install github.com/rhysd/actionlint/cmd/actionlint@latest"
        echo "   Or run: docker run --rm -v \$PWD:/repo rhysd/actionlint:latest"
    fi
else
    success "No workflow changes (skipping)"
fi
echo ""

# ============================================
# SUMMARY
# ============================================
echo "=================================="
echo "Guard Rails Summary"
echo "=================================="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ COMMIT BLOCKED${NC}"
    echo "Fix the $ERRORS error(s) above before committing."
    echo ""
    echo "To bypass (not recommended): git commit --no-verify"
    echo "This will allow committing but code may fail in GitHub Actions CI."
    exit 1
else
    echo -e "${GREEN}✓ ALL GUARD RAILS PASSED${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo "Review $WARNINGS warning(s) above before pushing."
        echo -e "${YELLOW}⚠ COMMIT ALLOWED WITH WARNINGS${NC}"
    else
        echo "Safe to commit!"
    fi
    exit 0
fi
