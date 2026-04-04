#!/usr/bin/env bash
#
# verify_version_consistency.sh - RYAN Module
# Check all version claims against VERSION file (source of truth)
#

# Don't use set -e as it causes issues with process substitution
# set -e

VERSION_FILE="VERSION"
FIX_MODE=false
REPORT_MODE=false
DRY_RUN=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
    echo "Usage: $0 [--fix] [--report] [--dry-run]"
    echo ""
    echo "Options:"
    echo "  --fix      Automatically fix version mismatches"
    echo "  --report   Generate JSON report"
    echo "  --dry-run  Show what would be fixed without changing"
    echo ""
    echo "Examples:"
    echo "  $0                    # Check only"
    echo "  $0 --fix              # Check and fix"
    echo "  $0 --dry-run          # Preview fixes"
    echo "  $0 --report --fix     # Fix and generate report"
    exit 1
}

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --fix) FIX_MODE=true ;;
        --report) REPORT_MODE=true ;;
        --dry-run) DRY_RUN=true ;;
        -h|--help) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
    shift
done

# Get source version
if [[ ! -f "$VERSION_FILE" ]]; then
    echo -e "${RED}Error: VERSION file not found${NC}"
    exit 1
fi

SOURCE_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
echo -e "${BLUE}Source version (VERSION file):${NC} $SOURCE_VERSION"
echo ""

# Initialize results
declare -a CHECKS
declare -i PASS=0
declare -i FAIL=0

# Check markdown files for version claims
check_file() {
    local file=$1
    local found_version=""
    local status="PASS"
    local severity="LOW"

    # Check frontmatter version
    if [[ "$file" == *SKILL.md ]]; then
        found_version=$(grep "^version:" "$file" 2>/dev/null | head -1 | sed 's/version: *//' | tr -d '[:space:]')
        if [[ -n "$found_version" && "$found_version" != "$SOURCE_VERSION" ]]; then
            status="FAIL"
            severity="MEDIUM"
        fi
    fi

    # Check markdown headers
    if grep -q "Version.*:" "$file" 2>/dev/null; then
        local header_version=$(grep -i "version.*:" "$file" | grep -v "Source" | head -1 | sed 's/.*Version.*: *//' | tr -d '[:space:]')
        if [[ -n "$header_version" && "$header_version" != "$SOURCE_VERSION" && "$header_version" != "v${SOURCE_VERSION}" ]]; then
            status="FAIL"
            severity="HIGH"
            found_version="$header_version"
        fi
    fi

    # Check for v1.0.0 template pattern
    if grep -q "v1\.0\.0\|version.*1\.0\.0" "$file" 2>/dev/null; then
        status="FAIL"
        severity="HIGH"
        found_version="1.0.0 (template default)"
    fi

    # Report
    if [[ "$status" == "FAIL" ]]; then
        echo -e "${RED}❌ FAIL${NC} $file"
        echo -e "   Claimed: ${YELLOW}$found_version${NC}"
        echo -e "   Actual:  ${GREEN}$SOURCE_VERSION${NC}"
        echo -e "   Severity: ${RED}$severity${NC}"
        ((FAIL++))

        # Fix if requested
        if [[ "$FIX_MODE" == true && "$DRY_RUN" == false ]]; then
            # Fix SKILL.md frontmatter
            if [[ "$file" == *SKILL.md ]]; then
                sed -i "s/^version: *.*/version: $SOURCE_VERSION/" "$file"
                echo -e "   ${GREEN}→ Fixed frontmatter version${NC}"
            fi

            # Fix markdown headers
            sed -i "s/v1\.0\.0/v$SOURCE_VERSION/g" "$file"
            sed -i "s/Version.*:.*1\.0\.0/Version: $SOURCE_VERSION/g" "$file"
            echo -e "   ${GREEN}→ Fixed header versions${NC}"
        elif [[ "$DRY_RUN" == true ]]; then
            echo -e "   ${YELLOW}→ Would fix (dry run)${NC}"
        fi

        CHECKS+=("{\"file\":\"$file\",\"claimed\":\"$found_version\",\"actual\":\"$SOURCE_VERSION\",\"status\":\"FAIL\",\"severity\":\"$severity\"}")
    else
        [[ -n "$found_version" ]] && echo -e "${GREEN}✓ PASS${NC} $file (version: $found_version)"
        ((PASS++))
        CHECKS+=("{\"file\":\"$file\",\"claimed\":\"$found_version\",\"actual\":\"$SOURCE_VERSION\",\"status\":\"PASS\"}")
    fi
}

# Main execution
echo -e "${BLUE}Checking version claims...${NC}"
echo ""

# Find all markdown files
while IFS= read -r file; do
    [[ -f "$file" ]] && check_file "$file"
done < <(find . -name "*.md" -type f 2>/dev/null | grep -v node_modules | grep -v ".git")

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}Summary${NC}"
echo "═══════════════════════════════════════════════════════════"
echo -e "Total checked: $((PASS + FAIL))"
echo -e "${GREEN}Pass: $PASS${NC}"

if [[ $FAIL -gt 0 ]]; then
    echo -e "${RED}Fail: $FAIL${NC}"
    echo ""
    echo "Run with --fix to automatically correct version mismatches"
else
    echo -e "${GREEN}All version claims match SOURCE_VERSION!${NC}"
fi

# JSON Report
if [[ "$REPORT_MODE" == true ]]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "JSON Report"
    echo "═══════════════════════════════════════════════════════════"
    echo "{"
    echo "  \"source_version\": \"$SOURCE_VERSION\","
    echo "  \"summary\": {"
    echo "    \"total\": $((PASS + FAIL)),"
    echo "    \"pass\": $PASS,"
    echo "    \"fail\": $FAIL"
    echo "  },"
    echo "  \"checks\": ["
    local first=true
    for check in "${CHECKS[@]}"; do
        [[ "$first" == false ]] && echo ","
        first=false
        echo -n "    $check"
    done
    echo ""
    echo "  ]"
    echo "}"
fi

exit $FAIL
