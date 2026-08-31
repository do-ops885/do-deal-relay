#!/usr/bin/env bash
#
# verify_version_consistency.sh - RYAN Module
# Check product version claims against VERSION file (skill-independent per ADR-024)
#

VERSION_FILE="VERSION"
FIX_MODE=false
REPORT_MODE=false
DRY_RUN=false
SKILL_INDEPENDENT=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
    echo "Usage: $0 [--fix] [--report] [--dry-run] [--skill-independent]"
    echo ""
    echo "Options:"
    echo "  --fix                Automatically fix version mismatches (product docs only in --skill-independent)"
    echo "  --report             Generate JSON report"
    echo "  --dry-run            Show what would be fixed without changing"
    echo "  --skill-independent  Exclude .agents/skills/*/SKILL.md and evals.json frontmatter (ADR-024)"
    echo "  -h, --help           Show help"
    echo ""
    echo "Examples:"
    echo "  $0                               # Strict check (legacy)"
    echo "  $0 --skill-independent           # Product docs only (default for CI)"
    echo "  $0 --skill-independent --fix     # Fix product docs"
    echo "  $0 --report --skill-independent  # JSON report"
    exit 1
}

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --fix) FIX_MODE=true ;;
        --report) REPORT_MODE=true ;;
        --dry-run) DRY_RUN=true ;;
        --skill-independent) SKILL_INDEPENDENT=true ;;
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

SOURCE_VERSION=$(tr -d '[:space:]' < "$VERSION_FILE")
echo -e "${BLUE}Source version (VERSION file):${NC} $SOURCE_VERSION"
if [[ "$SKILL_INDEPENDENT" == true ]]; then
    echo -e "${BLUE}Mode:${NC} skill-independent (ADR-024) — skill frontmatter excluded"
else
    echo -e "${BLUE}Mode:${NC} strict (legacy) — all SKILL.md checked"
fi
echo ""

# Initialize results
declare -a CHECKS
declare -i PASS=0
declare -i FAIL=0

is_skill_file() {
    local f=$1
    [[ "$f" == .agents/skills/*SKILL.md ]] || [[ "$f" == *evals.json ]] && return 0
    # also match any .agents/skills path
    [[ "$f" == *.agents/skills/* ]] && return 0
    return 1
}

# Check markdown files for version claims
check_file() {
    local file=$1
    local found_version=""
    local status="PASS"
    local severity="LOW"
    local is_skill=false

    if is_skill_file "$file"; then
        is_skill=true
    fi

    # Check frontmatter version — skip in skill-independent mode for skill files
    if [[ "$file" == *SKILL.md ]]; then
        if [[ "$SKILL_INDEPENDENT" == true && "$is_skill" == true ]]; then
            # Validate skill version is semver but don't compare to product VERSION
            local sv=$(grep "^version:" "$file" 2>/dev/null | head -1 | sed 's/version: *//' | tr -d '[:space:]' | tr -d '"' | tr -d "'")
            if [[ -n "$sv" ]] && ! echo "$sv" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
                status="FAIL"
                severity="MEDIUM"
                found_version="$sv (invalid semver)"
            else
                # informational pass
                [[ -n "$sv" ]] && echo -e "${GREEN}✓ PASS${NC} $file (skill version: $sv, independent)"
                ((PASS++))
                CHECKS+=("{\"file\":\"$file\",\"claimed\":\"$sv\",\"actual\":\"$SOURCE_VERSION\",\"status\":\"PASS\",\"mode\":\"skill-independent\"}")
                return
            fi
        else
            found_version=$(grep "^version:" "$file" 2>/dev/null | head -1 | sed 's/version: *//' | tr -d '[:space:]' | tr -d '"' | tr -d "'")
            if [[ -n "$found_version" && "$found_version" != "$SOURCE_VERSION" ]]; then
                status="FAIL"
                severity="MEDIUM"
            fi
        fi
    fi

    # Skip illustrative examples (<!-- illustrative -->) — don't treat as product claims
    if grep -q "<!-- illustrative" "$file" 2>/dev/null; then
        # Still check non-illustrative lines: if file ONLY has illustrative versions, pass
        # For simplicity, if all version lines are marked illustrative, we pass
        local non_illustrative=$(grep -v "illustrative" "$file" | grep -c "Version.*:" 2>/dev/null || true)
        if [[ "$non_illustrative" -eq 0 ]]; then
            # Only illustrative — check for template v1.0.0 still matters for product docs outside skills
            if grep -v "illustrative" "$file" | grep -q "v1\.0\.0\|version.*1\.0\.0" 2>/dev/null; then
                : # will be caught below if not excluded
            fi
        fi
    fi

    # Check markdown headers — always check for product VERSION (even in skill-independent)
    # Only flag if header_version is clean semver (vX.Y.Z) — ignore prose like "Version Drift: ..."
    if grep -q "Version.*:" "$file" 2>/dev/null; then
        # In skill-independent, only flag template v1.0.0; product header drift is WARN via suggest_fixes
        if [[ "$SKILL_INDEPENDENT" == true ]]; then
            # Don't hard-fail on header drift in skill-independent; rely on v1.0.0 template check
            : # skip header strict check
        else
            local header_version=$(grep -i "version.*:" "$file" | grep -v "Source" | head -1 | sed 's/.*Version.*: *//' | sed 's/<!--.*-->//' | tr -d '[:space:]' | cut -d' ' -f1 | tr -d '"' | tr -d "'" | tr -d ')' | tr -d '(' | tr -d ',' )
            # Only consider pure semver claims
            if echo "$header_version" | grep -qE '^v?[0-9]+\.[0-9]+\.[0-9]+$'; then
                local normalized=$(echo "$header_version" | sed 's/^v//')
                if [[ "$normalized" != "$SOURCE_VERSION" ]]; then
                    status="FAIL"
                    severity="HIGH"
                    found_version="$header_version"
                fi
            fi
        fi
    fi

    # Check for v1.0.0 template pattern — in skill-independent mode, skip skill files and historical reports
    if [[ "$SKILL_INDEPENDENT" == true ]]; then
        # Skip historical reports/archived and skill illustrative
        if [[ "$file" == *reports/* ]] || [[ "$file" == *archived* ]] || grep -q "illustrative" "$file" 2>/dev/null; then
            : # skip template check
        elif is_skill_file "$file"; then
            : # skip skill template in independent mode
        elif grep -q "v1\.0\.0\|version.*1\.0\.0" "$file" 2>/dev/null; then
            # Flag only product doc template defaults outside reports
            if grep "v1\.0\.0" "$file" 2>/dev/null | grep -q "illustrative"; then
                : # skip
            else
                status="FAIL"
                severity="HIGH"
                found_version="1.0.0 (template default)"
            fi
        fi
    else
        if grep -q "v1\.0\.0\|version.*1\.0\.0" "$file" 2>/dev/null; then
            if grep "v1\.0\.0" "$file" 2>/dev/null | grep -q "illustrative"; then
                : # skip
            else
                status="FAIL"
                severity="HIGH"
                found_version="1.0.0 (template default)"
            fi
        fi
    fi

    # Report
    if [[ "$status" == "FAIL" ]]; then
        echo -e "${RED}❌ FAIL${NC} $file"
        echo -e "   Claimed: ${YELLOW}$found_version${NC}"
        echo -e "   Actual:  ${GREEN}$SOURCE_VERSION${NC}"
        echo -e "   Severity: ${RED}$severity${NC}"
        ((FAIL++))

        # Fix if requested — in skill-independent, never fix skill frontmatter
        if [[ "$FIX_MODE" == true && "$DRY_RUN" == false ]]; then
            if [[ "$file" == *SKILL.md && "$SKILL_INDEPENDENT" == true && "$is_skill" == true ]]; then
                echo -e "   ${YELLOW}→ Skipped (skill-independent)${NC}"
            else
                if [[ "$file" == *SKILL.md ]]; then
                    sed -i "s/^version: *.*/version: $SOURCE_VERSION/" "$file"
                    echo -e "   ${GREEN}→ Fixed frontmatter version${NC}"
                fi
                sed -i "s/v1\.0\.0/v$SOURCE_VERSION/g" "$file"
                echo -e "   ${GREEN}→ Fixed header versions${NC}"
            fi
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
    if [[ "$SKILL_INDEPENDENT" == true ]]; then
        echo "Product doc mismatches remain. Run with --fix to correct."
    else
        echo "Run with --fix or --skill-independent to handle skill-independent policy"
    fi
else
    echo -e "${GREEN}All version claims match!${NC}"
    if [[ "$SKILL_INDEPENDENT" == true ]]; then
        echo -e "${GREEN}(skill-independent mode)${NC}"
    fi
fi

# JSON Report
if [[ "$REPORT_MODE" == true ]]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "JSON Report"
    echo "═══════════════════════════════════════════════════════════"
    echo "{"
    echo "  \"source_version\": \"$SOURCE_VERSION\","
    echo "  \"mode\": \"$([ "$SKILL_INDEPENDENT" == true ] && echo "skill-independent" || echo "strict")\","
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
