#!/bin/bash
#
# Root Directory File Organization Checker
# Standalone script to validate file organization
# Usage: ./scripts/check-root-files.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

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

echo "🏛️  Root Directory File Organization Check"
echo "============================================"
echo ""

# List of allowed files in root (standard project files only)
ALLOWED_ROOT_FILES=(
    ".gitignore"
    "package.json"
    "package-lock.json"
    "tsconfig.json"
    "vitest.config.ts"
    "wrangler.toml"
    "README.md"
    "VERSION"
    "LICENSE"
)

# Check current root directory
echo "Checking files in root directory..."
echo ""

ROOT_VIOLATIONS=0
CURRENT_FILES=$(ls -1)

for file in $CURRENT_FILES; do
    # Skip directories
    if [ -d "$file" ]; then
        continue
    fi

    # Check if it's an allowed file
    ALLOWED=false
    for allowed in "${ALLOWED_ROOT_FILES[@]}"; do
        if [ "$file" = "$allowed" ]; then
            ALLOWED=true
            break
        fi
    done

    if [ "$ALLOWED" = false ]; then
        error "Non-essential file in root: $file"
        ROOT_VIOLATIONS=$((ROOT_VIOLATIONS + 1))
    else
        success "Allowed: $file"
    fi
done

echo ""
echo "============================================"

if [ $ROOT_VIOLATIONS -eq 0 ]; then
    echo -e "${GREEN}✓ All root files are properly organized${NC}"
    echo ""
    info "Allowed files in root:"
    for allowed in "${ALLOWED_ROOT_FILES[@]}"; do
        echo "   - $allowed"
    done
else
    echo -e "${RED}✗ Found $ROOT_VIOLATIONS file(s) in incorrect location${NC}"
    echo ""
    info "Proper file destinations:"
    echo "   Documentation → docs/ or agents-docs/"
    echo "   Reports/status → temp/"
    echo "   Scripts → scripts/"
    echo "   Tests → tests/"
    echo "   Source code → worker/"
    echo "   Generated files → temp/"
    echo ""
    info "See: agents-docs/guard-rails.md"
fi

echo ""
echo "Total Errors: $ERRORS"
echo "Total Warnings: $WARNINGS"

exit $ERRORS
