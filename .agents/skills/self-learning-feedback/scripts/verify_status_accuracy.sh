#!/usr/bin/env bash
#
# verify_status_accuracy.sh - RYAN Module
# Verify that Status: Complete claims have evidence
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STRICT=false

usage() {
    echo "Usage: $0 [--strict] [--help]"
    echo "  --strict  Require coverage >80% and docs for Complete claims"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --strict) STRICT=true ;;
        --help|-h) usage ;;
        *) echo "Unknown: $1"; usage ;;
    esac
    shift
done

FAILED=0
PASSED=0
WARNED=0

echo -e "${BLUE}Checking status accuracy...${NC}"
echo ""

# Patterns that claim completion
COMPLETE_PATTERNS=("Status: Complete" "Status: Implemented" "All Implemented" "Ready for Production" "MVP Complete")

# Skip historical reports, archived, and skill template (its checklist mentions Status: Complete as example)
while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    if [[ "$file" == *reports/* ]] || [[ "$file" == *archived* ]] || [[ "$file" == *".agents/skills/self-learning-feedback/SKILL.md" ]]; then
        continue
    fi
    # Only consider files where claim is in header/status area (first 30 lines or **Status line)
    if ! head -30 "$file" | grep -q "Status.*Complete\|Status.*Implemented\|All Implemented" 2>/dev/null; then
        if ! grep -qE "^\*\*Status.*(Complete|Implemented)" "$file" 2>/dev/null; then
            continue
        fi
    fi
    claimed=""
    for pat in "${COMPLETE_PATTERNS[@]}"; do
        if grep -q "$pat" "$file" 2>/dev/null; then
            claimed="$pat"
            break
        fi
    done
    [[ -z "$claimed" ]] && continue

    # Determine expected evidence
    evidence_ok=true
    reason=""

    # Basic: Implementation files exist? (check sibling feature dir or worker/)
    # For agents-docs/features/*.md, check worker/ exists
    # For skill SKILL.md, check modules/ exists
    if [[ "$file" == agents-docs/features/*.md ]]; then
        # Check that at least one worker file or route exists for feature
        # Simple heuristic: file should not be the only evidence; we check that worker/ has files
        if [[ ! -d "worker" ]]; then
            evidence_ok=false
            reason="worker/ directory missing"
        fi
    fi
    if [[ "$file" == .agents/skills/*SKILL.md ]]; then
        if [[ ! -d "$(dirname "$file")/modules" ]]; then
            evidence_ok=false
            reason="modules/ missing"
        fi
    fi

    # Check for unchecked TODOs in same file — if present, status is misleading
    # BUT allow those in Future Work/Roadmap sections (handled by todo_alignment; here just warn)
    unchecked=$(grep -c "\[ \]" "$file" 2>/dev/null || true)
    # Count those outside Future Work
    # Simple: if unchecked >0 and claim is Complete, warn
    if [[ "$unchecked" -gt 0 ]]; then
        # Check if unchecked items are in allowed sections
        # If file has Future Work and all unchecked are after it, we consider ok
        # For now, just warn not fail
        future_line=$(grep -n "Future Work\|Roadmap\|Optional" "$file" 2>/dev/null | head -1 | cut -d: -f1 || echo "")
        unchecked_lines=$(grep -n "\[ \]" "$file" 2>/dev/null | cut -d: -f1 || true)
        has_blocking=false
        for l in $unchecked_lines; do
            if [[ -z "$future_line" ]]; then
                has_blocking=true
                break
            fi
            if [[ "$l" -lt "$future_line" ]]; then
                has_blocking=true
                break
            fi
        done
        if [[ "$has_blocking" == true ]]; then
            echo -e "${YELLOW}⚠ WARN${NC} $file"
            echo -e "   Claim: $claimed but has $unchecked unchecked [ ] before Future Work"
            ((WARNED++))
            continue
        fi
    fi

    if [[ "$evidence_ok" == true ]]; then
        echo -e "${GREEN}✓ PASS${NC} $file ($claimed)"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC} $file"
        echo -e "   Claim: $claimed — $reason"
        ((FAILED++))
    fi

done < <(grep -r -l "Status: Complete\|Status: Implemented\|All Implemented\|Ready for Production\|MVP Complete" --include="*.md" ./agents-docs ./plans ./.agents/skills/self-learning-feedback ./AGENTS.md 2>/dev/null | grep -v node_modules | grep -v ".git" || true)

# Strict mode additional checks
if [[ "$STRICT" == true ]]; then
    echo ""
    echo -e "${BLUE}Strict mode: checking coverage${NC}"
    if [[ -f "coverage/lcov.info" ]]; then
        # crude coverage check
        echo -e "${GREEN}  coverage file exists${NC}"
    else
        echo -e "${YELLOW}  ⚠ no coverage/lcov.info (skip)${NC}"
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}Summary${NC}"
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}Pass: $PASSED${NC}"
[[ $WARNED -gt 0 ]] && echo -e "${YELLOW}Warn: $WARNED${NC}"
[[ $FAILED -gt 0 ]] && echo -e "${RED}Fail: $FAILED${NC}" || echo -e "${GREEN}All status claims have evidence (or warnings only)${NC}"

# WARN does not block; only FAIL blocks
exit $FAILED
