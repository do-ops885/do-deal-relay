#!/usr/bin/env bash
#
# verify_typo_misleading.sh - RYAN Module
# Check for misleading typos like left learnded
#

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TARGET="${1:-}"

usage() {
    echo "Usage: $0 [file] [--help]"
    echo "  Without file, scans all md files"
    exit 1
}

[[ "$TARGET" == "--help" || "$TARGET" == "-h" ]] && usage

FAILED=0
WARNED=0

# Patterns: regex -> suggestion -> severity
declare -A PATTERNS
# Note: patterns that appear in doc tables describing the pattern itself are excluded via grep -v of table pipes
PATTERNS["left learnded"]="lessons learned|HIGH"
PATTERNS["learnded"]="learned|HIGH"

echo -e "${BLUE}Checking misleading typos...${NC}"
echo ""

check_file() {
    local file=$1
    local found=false
    for pat in "${!PATTERNS[@]}"; do
        local info="${PATTERNS[$pat]}"
        local suggestion=$(echo "$info" | cut -d'|' -f1)
        local severity=$(echo "$info" | cut -d'|' -f2)
        # Skip table rows and checklist examples that intentionally mention the pattern
        # e.g., `| "learnded" | ...` or `- [ ] No "left learnded" typos`
        local raw_hits=$(grep -n -E -i "$pat" "$file" 2>/dev/null || true)
        [[ -z "$raw_hits" ]] && continue
        # Filter out documentation lines (table pipes or checklist examples containing `No "` or quotes)
        local hits=$(echo "$raw_hits" | grep -v "|" | grep -v 'No "' | grep -v '"left' | head -3 || true)
        [[ -z "$hits" ]] && continue
        if grep -q -E -i "$pat" "$file" 2>/dev/null; then
            # double-check filtered non-empty
            [[ -z "$hits" ]] && continue
            if [[ "$severity" == "HIGH" ]]; then
                echo -e "${RED}❌ FAIL${NC} $file — pattern '$pat' -> '$suggestion' ($severity)"
                # shellcheck disable=SC2001
                echo "${hits}" | sed 's/^/  /'
                found=true
                WARNED=$((WARNED+1))
            else
                echo -e "${YELLOW}⚠ WARN${NC} $file — pattern '$pat' -> '$suggestion'"
                # shellcheck disable=SC2001
                echo "${hits}" | sed 's/^/  /'
                WARNED=$((WARNED+1))
            fi
        fi
    done
    # Return 0 always — typos are WARN not hard FAIL, unless HIGH
    if [[ "$found" == true ]]; then
        FAILED=$((FAILED+1))
    fi
}

if [[ -n "$TARGET" && -f "$TARGET" ]]; then
    check_file "$TARGET"
else
    while IFS= read -r f; do
        [[ -f "$f" ]] && check_file "$f"
    done < <(find . -name "*.md" -type f 2>/dev/null | grep -v node_modules | grep -v ".git")
fi

# Also check for duplicate words? simple heuristic: not needed

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}Summary${NC}"
echo "═══════════════════════════════════════════════════════════"
if [[ $WARNED -eq 0 ]]; then
    echo -e "${GREEN}No misleading typos found${NC}"
else
    echo -e "${YELLOW}Warnings: $WARNED${NC}"
    if [[ $FAILED -gt 0 ]]; then
        echo -e "${RED}High severity: $FAILED${NC}"
    fi
fi

# Exit 0 always for typo — non-blocking; report via WARN
exit 0
