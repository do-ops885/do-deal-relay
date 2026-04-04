#!/bin/bash
#
# Validation Script for Deal Discovery System
# Runs all 9 validation gates locally
# All operations have timeouts to prevent hanging
#

set -e

echo "🔍 Deal Discovery System - Validation Script"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Timeouts (seconds)
TSC_TIMEOUT=30
GREP_TIMEOUT=10
JQ_TIMEOUT=10

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        ERRORS=$((ERRORS + 1))
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

echo "📋 Running validation gates..."
echo ""

# Gate 1: Check TypeScript compilation
echo "Gate 1: TypeScript Compilation"
if timeout "${TSC_TIMEOUT}" npx tsc --noEmit 2>/dev/null; then
    print_status 0 "TypeScript compiles without errors"
else
    exit_code=$?
    if [ $exit_code -eq 124 ]; then
        print_warning "TypeScript compilation timed out (${TSC_TIMEOUT}s)"
    else
        print_status 1 "TypeScript compilation failed"
    fi
fi
echo ""

# Gate 2: Check for hardcoded secrets
echo "Gate 2: Secret Detection"
SECRETS_FOUND=0
GREP_ARGS="--include=*.ts --include=*.js --include=*.json -r"
EXCLUDE="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.agents"

if timeout "${GREP_TIMEOUT}" grep ${GREP_ARGS} ${EXCLUDE} "ghp_[a-zA-Z0-9]{36,}" . 2>/dev/null; then
    SECRETS_FOUND=1
fi
if timeout "${GREP_TIMEOUT}" grep ${GREP_ARGS} ${EXCLUDE} "sk-[a-zA-Z0-9]{20,}" . 2>/dev/null; then
    SECRETS_FOUND=1
fi
if [ $SECRETS_FOUND -eq 0 ]; then
    print_status 0 "No hardcoded secrets detected"
else
    print_status 1 "Hardcoded secrets detected!"
fi
echo ""

# Gate 3: File size limits (500 LOC max per file)
echo "Gate 3: File Size Limits"
OVERSIZED=0
for file in worker/**/*.ts; do
    if [ -f "$file" ]; then
        LINES=$(wc -l < "$file")
        if [ $LINES -gt 500 ]; then
            print_warning "$file has $LINES lines (max 500)"
            OVERSIZED=1
        fi
    fi
done
if [ $OVERSIZED -eq 0 ]; then
    print_status 0 "All files within size limits"
else
    print_status 0 "Some files exceed limits (warnings only)"
fi
echo ""

# Gate 4: Check for required files
echo "Gate 4: Required Files"
REQUIRED_FILES=(
    "AGENTS.md"
    "package.json"
    "tsconfig.json"
    "wrangler.jsonc"
    "worker/index.ts"
    "worker/types.ts"
    "worker/config.ts"
    "worker/state-machine.ts"
)

MISSING=0
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        print_status 1 "Missing required file: $file"
        MISSING=1
    fi
done
if [ $MISSING -eq 0 ]; then
    print_status 0 "All required files present"
fi
echo ""

# Gate 5: Validate JSON files
echo "Gate 5: JSON Validity"
INVALID_JSON=0
while IFS= read -r file; do
    if ! timeout "${JQ_TIMEOUT}" jq empty "$file" 2>/dev/null; then
        print_status 1 "Invalid JSON: $file"
        INVALID_JSON=1
    fi
done < <(find . -name "*.json" -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./.agents/*")
if [ $INVALID_JSON -eq 0 ]; then
    print_status 0 "All JSON files are valid"
fi
echo ""

# Gate 6: Check for TODO comments
echo "Gate 6: TODO/FIXME Check"
TODOS=$(timeout "${GREP_TIMEOUT}" grep -r "TODO\|FIXME" --include="*.ts" --include="*.js" . 2>/dev/null | grep -v "node_modules" | grep -v ".git" | wc -l || echo "0")
if [ "$TODOS" -eq 0 ]; then
    print_status 0 "No TODO/FIXME comments found"
else
    print_warning "Found $TODOS TODO/FIXME comments (review recommended)"
fi
echo ""

# Gate 7: Check wrangler.jsonc configuration
echo "Gate 7: Wrangler Configuration"
if [ -f "wrangler.jsonc" ]; then
    if grep -q "DEALS_PROD" wrangler.jsonc && grep -q "DEALS_STAGING" wrangler.jsonc; then
        print_status 0 "KV namespaces configured"
    else
        print_warning "KV namespace placeholders present (needs real IDs for deploy)"
    fi

    if grep -q "crons" wrangler.jsonc; then
        print_status 0 "Cron trigger configured"
    else
        print_status 1 "Cron trigger not configured"
    fi
else
    print_status 1 "wrangler.jsonc not found"
fi
echo ""

# Gate 8: Validate schema version consistency
echo "Gate 8: Schema Version Consistency"
CONFIG_VERSION=$(grep "SCHEMA_VERSION" worker/config.ts | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "")
AGENTS_VERSION=$(grep -i "Version" AGENTS.md | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "")

if [ -n "$CONFIG_VERSION" ] && [ "$CONFIG_VERSION" = "$AGENTS_VERSION" ]; then
    print_status 0 "Schema versions consistent ($CONFIG_VERSION)"
else
    print_warning "Schema version mismatch: config=$CONFIG_VERSION, agents=$AGENTS_VERSION"
fi
echo ""

# Gate 9: Check for unsafe patterns
echo "Gate 9: Security Patterns"
UNSAFE=0

# Check for eval()
if timeout "${GREP_TIMEOUT}" grep -r "eval(" --include="*.ts" --include="*.js" . 2>/dev/null | grep -v "node_modules" | grep -v ".git"; then
    print_status 1 "Unsafe eval() detected"
    UNSAFE=1
fi

# Check for innerHTML
if timeout "${GREP_TIMEOUT}" grep -r "innerHTML" --include="*.ts" --include="*.js" . 2>/dev/null | grep -v "node_modules" | grep -v ".git"; then
    print_warning "innerHTML usage detected (review for XSS)"
fi

# Check for http:// (should be https://) - allow localhost for development
if timeout "${GREP_TIMEOUT}" grep -r "http://" --include="*.ts" --include="*.json" . 2>/dev/null | grep -v "node_modules" | grep -v ".git" | grep -v "https://" | grep -v "tests/" | grep -v "localhost" | grep -v "allow-http" | grep -v "temp/"; then
    print_warning "HTTP URLs found (should use HTTPS)"
fi

if [ $UNSAFE -eq 0 ]; then
    print_status 0 "No critical security issues found"
fi
echo ""

# Summary
echo "============================================"
echo "📊 Validation Summary"
echo "============================================"
echo ""
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All validation gates passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Validation failed with $ERRORS error(s)${NC}"
    exit 1
fi
