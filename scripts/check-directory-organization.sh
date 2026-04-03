#!/bin/bash
#
# Directory Organization Validation Script
# Validates that files are in correct folders per AGENTS.md rules
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

error() {
    echo -e "${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "📁 Validating directory organization..."
echo ""

# Check 1: Root directory files
ROOT_VIOLATIONS=0
ALLOWED_ROOT_FILES=(
    "\.gitignore"
    "package\.json"
    "package-lock\.json"
    "tsconfig\.json"
    "vitest\.config\.ts"
    "wrangler\.toml"
    "README\.md"
    "VERSION"
    "LICENSE"
    "AGENTS\.md"
    "CLAUDE\.md"
    "GEMINI\.md"
    "QWEN\.md"
    "opencode\.json"
    "CHANGELOG\.md"
    "SECURITY\.md"
    "CONTRIBUTING\.md"
    "QUICKSTART\.md"
    "MIGRATION\.md"
    "state\.json"
    "markdownlint\.toml"
    "\.pre-commit-config\.yaml"
)

# Get all files in root (not in subdirectories)
for file in $(find . -maxdepth 1 -type f -name "*.md" -o -name "*.json" -o -name "*.ts" -o -name "*.toml" -o -name "VERSION" -o -name "LICENSE" | sed 's|^\./||'); do
    ALLOWED=false
    for pattern in "${ALLOWED_ROOT_FILES[@]}"; do
        if echo "$file" | grep -qE "^${pattern}$"; then
            ALLOWED=true
            break
        fi
    done

    if [ "$ALLOWED" = false ]; then
        error "Non-essential file in root: $file"
        ROOT_VIOLATIONS=$((ROOT_VIOLATIONS + 1))
    fi
done

if [ $ROOT_VIOLATIONS -eq 0 ]; then
    success "Root directory contains only essential files"
fi

# Check 2: Documentation files location
echo ""
echo "Check 2: Documentation file locations"
DOC_VIOLATIONS=0

# Find all .md files not in allowed documentation folders
for file in $(find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" | sed 's|^\./||'); do
    # Skip if in allowed location
    if [[ "$file" == docs/* ]] || \
       [[ "$file" == agents-docs/* ]] || \
       [[ "$file" == plans/* ]] || \
       [[ "$file" == reports/* ]] || \
       [[ "$file" == .github/* ]] || \
       [[ "$file" == .agents/skills/* ]] || \
       [[ "$file" == temp/* ]] || \
       [[ "$file" == public/* ]] || \
       [[ "$file" == */README.md ]] || \
       [[ "$file" == */webhooks-README.md ]] || \
       [[ "$file" == README.md ]] || \
       [[ "$file" == AGENTS.md ]] || \
       [[ "$file" == CHANGELOG.md ]] || \
       [[ "$file" == SECURITY.md ]] || \
       [[ "$file" == CONTRIBUTING.md ]] || \
       [[ "$file" == QUICKSTART.md ]] || \
       [[ "$file" == MIGRATION.md ]] || \
       [[ "$file" == .claude/*.md ]] || \
       [[ "$file" == .opencode/*.md ]] || \
       [[ "$file" == .gemini/*.md ]] || \
       [[ "$file" == .qwen/*.md ]] || \
       [[ "$file" == .jules/*.md ]]; then
        continue
    fi

    # Check if in root (already caught by Check 1)
    if [[ ! "$file" == */* ]]; then
        continue
    fi

    error "Documentation file in wrong location: $file"
    echo "   Should be in: docs/, agents-docs/, plans/, or reports/"
    DOC_VIOLATIONS=$((DOC_VIOLATIONS + 1))
done

if [ $DOC_VIOLATIONS -eq 0 ]; then
    success "All documentation files in correct locations"
fi

# Check 3: Execution plans location
echo ""
echo "Check 3: Execution plans location"
PLAN_VIOLATIONS=0

# Check for files with "plan" or "execution" in name not in plans/
for file in $(find . -type f \( -iname "*plan*.md" -o -iname "*execution*.md" \) -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./plans/*" | sed 's|^\./||'); do
    # Skip if it's the main AGENTS.md or README
    if [[ "$file" == "AGENTS.md" ]] || [[ "$file" == "README.md" ]]; then
        continue
    fi

    warning "Potential plan file outside plans/: $file"
    echo "   Consider moving to: plans/"
    PLAN_VIOLATIONS=$((PLAN_VIOLATIONS + 1))
done

if [ $PLAN_VIOLATIONS -eq 0 ]; then
    success "All plan files in correct locations"
fi

# Check 4: Analysis reports location
echo ""
echo "Check 4: Analysis reports location"
REPORT_VIOLATIONS=0

# Check for analysis/investigation files not in reports/
for file in $(find . -type f \( -iname "*analysis*.md" -o -iname "*investigation*.md" -o -iname "*report*.md" \) -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./reports/*" | sed 's|^\./||'); do
    # Skip if it's a README or main docs
    if [[ "$file" == "README.md" ]] || [[ "$file" == AGENTS.md ]]; then
        continue
    fi

    warning "Potential report file outside reports/: $file"
    echo "   Consider moving to: reports/ or reports/analysis/"
    REPORT_VIOLATIONS=$((REPORT_VIOLATIONS + 1))
done

if [ $REPORT_VIOLATIONS -eq 0 ]; then
    success "All report files in correct locations"
fi

# Summary
echo ""
echo "=================================="
echo "Directory Organization Summary"
echo "=================================="
echo "Errors: $ERRORS"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All directory organization checks passed${NC}"
    exit 0
else
    echo -e "${RED}✗ Directory organization issues found${NC}"
    echo ""
    echo "Reference: See AGENTS.md for directory usage rules"
    exit 1
fi
