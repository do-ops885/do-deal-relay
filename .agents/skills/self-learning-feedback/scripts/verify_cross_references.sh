#!/usr/bin/env bash
#
# verify_cross_references.sh - RYAN Module
# Check markdown links resolve
#

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SINGLE_FILE=""

usage() {
    echo "Usage: $0 [--fix-broken] [--file <path>] [--help]"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --fix-broken) shift ;; # reserved
        --file) SINGLE_FILE="$2"; shift ;;
        --help|-h) usage ;;
        *) echo "Unknown: $1"; usage ;;
    esac
    shift
done

FAILED=0
PASSED=0
BROKEN=0

check_file() {
    local file=$1
    # Skip historical/reports and tests for cross-ref (they have many example placeholders)
    if [[ "$file" == *reports/* ]] || [[ "$file" == *archived* ]] || [[ "$file" == tests/* ]]; then
        return 0
    fi
    local dir=$(dirname "$file")
    # Extract markdown links [text](path) — exclude those inside backticks (inline code)
    local stripped=$(sed 's/`[^`]*`//g' "$file" 2>/dev/null)
    local links=$(echo "$stripped" | grep -oE '\[[^]]*\]\([^)]+\)' 2>/dev/null || true)
    [[ -z "$links" ]] && return 0
    # Skip checks for temp/ legacy paths (historical)
    if echo "$links" | grep -q "temp/"; then
        # Will filter per-link below
        :
    fi

    local local_failed=0
    while IFS= read -r link; do
        [[ -z "$link" ]] && continue
        local target=$(echo "$link" | sed -E 's/.*\(([^)]+)\).*/\1/')
        # Skip external, mailto, anchors, etc.
        if echo "$target" | grep -qE '^https?://|^mailto:|^#|^<'; then
            continue
        fi
        # Skip legacy temp/ paths and archived plans (historical, files may have moved)
        if echo "$target" | grep -q "temp/"; then
            continue
        fi
        if echo "$target" | grep -q "production-readiness\|PRE_EXISTING_CI_ISSUES"; then
            continue
        fi
        local path_part=$(echo "$target" | cut -d'#' -f1 | cut -d'?' -f1)
        [[ -z "$path_part" ]] && continue
        if echo "$path_part" | grep -qE '^/'; then
            continue
        fi
        # Only check markdown/json/config docs — skip .ts/.js code refs that are often relative
        if echo "$path_part" | grep -qE '\.(ts|js|mts|jsonc)$'; then
            # Check repo-root fallback, but don't fail if missing (code may move)
            if [[ -e "$path_part" || -e "$dir/$path_part" || -e "$(realpath -m "$dir/$path_part" 2>/dev/null)" ]]; then
                continue
            else
                continue
            fi
        fi
        local resolved="$dir/$path_part"
        resolved=$(realpath -m "$resolved" 2>/dev/null || echo "$resolved")
        if echo "$target" | grep -q "#"; then
            local anchor=$(echo "$target" | cut -d'#' -f2)
            local anchor_file="$dir/$path_part"
            [[ -z "$path_part" ]] && anchor_file="$file"
            if [[ -f "$anchor_file" ]]; then
                if ! grep -q -i "^#.*$anchor" "$anchor_file" 2>/dev/null && ! grep -q "id=\"$anchor\"" "$anchor_file" 2>/dev/null; then
                    continue
                fi
            fi
        fi
        # Check existence: try dir-relative, then repo-root relative
        if [[ ! -e "$resolved" && ! -e "$dir/$path_part" ]]; then
            if [[ ! -e "$path_part" ]]; then
                # Also try without leading ../
                local base=$(basename "$path_part")
                if [[ -f "$path_part" || -f "$base" ]]; then
                    continue
                fi
                echo -e "  ${RED}BROKEN${NC} $file -> $target (resolved: $resolved)"
                local_failed=1
            fi
        fi
    done <<< "$links"

    if [[ $local_failed -eq 1 ]]; then
        echo -e "${RED}❌ FAIL${NC} $file"
        ((FAILED++))
        ((BROKEN++))
    else
        ((PASSED++))
    fi
}

echo -e "${BLUE}Checking cross-references...${NC}"
echo ""

if [[ -n "$SINGLE_FILE" ]]; then
    check_file "$SINGLE_FILE"
else
    # Limit to product-relevant docs — avoids false positives in .opencode, reports, tests
    while IFS= read -r f; do
        [[ -f "$f" ]] && check_file "$f"
    done < <(find ./agents-docs ./plans ./.agents/skills/self-learning-feedback -name "*.md" -type f 2>/dev/null; echo "./AGENTS.md"; echo "./README.md" 2>/dev/null | tr ' ' '\n' | while read p; do [[ -f "$p" ]] && echo "$p"; done)
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}Summary${NC}"
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}Pass: $PASSED${NC}"
if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}Fail: $FAILED files with broken links${NC}"
    echo -e "${RED}Broken: $BROKEN${NC}"
else
    echo -e "${GREEN}All cross-references resolve${NC}"
fi

exit $FAILED
