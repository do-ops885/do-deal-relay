#!/usr/bin/env bash
#
# verify_todo_alignment.sh - RYAN Module
# Check that unchecked [ ] don't conflict with Status: Complete
#

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
    echo "Usage: $0 [--help]"
    exit 1
}
[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && usage

FAILED=0
PASSED=0

echo -e "${BLUE}Checking todo alignment...${NC}"
echo ""

while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    # Skip historical reports, archived, followups, and skill template checklists (they intentionally list checks)
    if [[ "$file" == *reports/* ]] || [[ "$file" == *archived* ]] || [[ "$file" == *FOLLOWUP* ]] || [[ "$file" == *GOAP* ]] || [[ "$file" == *".agents/skills/self-learning-feedback/SKILL.md" ]]; then
        continue
    fi

    # Only check files that claim Complete/Implemented as their own status (header line)
    if ! head -30 "$file" | grep -q "Status.*Complete\|Status.*Implemented\|All Implemented" 2>/dev/null; then
        if ! grep -qE "^\*\*Status.*(Complete|Implemented)|^Status: (Complete|Implemented)|^#.*Status.*(Complete|Implemented)" "$file" 2>/dev/null; then
            continue
        fi
    fi
    # Extra guard: skip files whose head status is Active/WIP etc. despite later mention
    if head -30 "$file" | grep -qE "^\*\*Status\*\*:.*(Active|WIP|Planned|Blocked|Deferred)" 2>/dev/null; then
        continue
    fi

    # Find unchecked items outside allowed sections
    # Allowed sections: Future Work, Roadmap, Optional, Deferred, Post-MVP
    allowed_pattern="Future Work|Roadmap|Optional|Deferred|Post-MVP"
    # Get line number where allowed section starts
    allowed_line=$(grep -n -E "$allowed_pattern" "$file" 2>/dev/null | head -1 | cut -d: -f1 || echo "")

    unchecked_count=0
    unchecked_details=""
    while IFS= read -r lineinfo; do
        [[ -z "$lineinfo" ]] && continue
        lnum=$(echo "$lineinfo" | cut -d: -f1)
        ltext=$(echo "$lineinfo" | cut -d: -f2-)
        # Skip if in allowed section
        if [[ -n "$allowed_line" && "$lnum" -ge "$allowed_line" ]]; then
            continue
        fi
        # Skip if marked Optional/Deferred on same line
        if echo "$ltext" | grep -q -E "Optional|Deferred|Post-MVP"; then
            continue
        fi
        unchecked_count=$((unchecked_count+1))
        unchecked_details="$unchecked_details\n  line $lnum: $ltext"
    done < <(grep -n "\[ \]" "$file" 2>/dev/null || true)

    if [[ "$unchecked_count" -gt 0 ]]; then
        echo -e "${RED}❌ FAIL${NC} $file"
        echo -e "   Status claims Complete but has $unchecked_count unchecked [ ] before allowed sections"
        echo -e "$unchecked_details"
        ((FAILED++))
    else
        echo -e "${GREEN}✓ PASS${NC} $file"
        ((PASSED++))
    fi
done < <(find ./agents-docs ./plans ./.agents/skills/self-learning-feedback -name "*.md" -type f 2>/dev/null; echo "./AGENTS.md" | tr ' ' '\n' | while read p; do [[ -f "$p" ]] && echo "$p"; done)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}Summary${NC}"
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}Pass: $PASSED${NC}"
if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}Fail: $FAILED${NC}"
else
    echo -e "${GREEN}All todos aligned${NC}"
fi

exit $FAILED
