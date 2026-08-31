#!/usr/bin/env bash
#
# quick_verify.sh - SYNTHESIS wrapper
# Run all RYAN verify checks + FLASH noise in one call
#
set -e

SKILL_DIR=".agents/skills/self-learning-feedback"
MODE="--skill-independent"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
    echo "Usage: $0 [--strict] [--help]"
    echo "  --strict  Use strict version check (include skill frontmatter)"
    echo "  --help    Show this"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --strict) MODE="" ;;
        --help|-h) usage ;;
        *) echo "Unknown: $1"; usage ;;
    esac
    shift
done

FAILED=0
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  quick_verify — self-learning-feedback${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

echo -e "${BLUE}▶ Version Consistency${NC}"
if bash "$SKILL_DIR/scripts/verify_version_consistency.sh" $MODE; then
    echo -e "${GREEN}  ✓ version ok${NC}"
else
    echo -e "${RED}  ✗ version failures${NC}"
    FAILED=$((FAILED+1))
fi
echo ""

echo -e "${BLUE}▶ Status Accuracy${NC}"
if bash "$SKILL_DIR/scripts/verify_status_accuracy.sh"; then
    echo -e "${GREEN}  ✓ status ok${NC}"
else
    echo -e "${RED}  ✗ status failures${NC}"
    FAILED=$((FAILED+1))
fi
echo ""

echo -e "${BLUE}▶ Todo Alignment${NC}"
if bash "$SKILL_DIR/scripts/verify_todo_alignment.sh"; then
    echo -e "${GREEN}  ✓ todo ok${NC}"
else
    echo -e "${RED}  ✗ todo failures${NC}"
    FAILED=$((FAILED+1))
fi
echo ""

echo -e "${BLUE}▶ Cross References${NC}"
if bash "$SKILL_DIR/scripts/verify_cross_references.sh"; then
    echo -e "${GREEN}  ✓ cross-ref ok${NC}"
else
    echo -e "${YELLOW}  ⚠ cross-ref warnings (non-blocking for quick_verify)${NC}"
    # Don't increment FAILED — cross-ref is advisory in quick mode
fi
echo ""

echo -e "${BLUE}▶ Typo / Misleading${NC}"
bash "$SKILL_DIR/scripts/verify_typo_misleading.sh" 2>&1 | tail -10 || true
echo -e "${GREEN}  ✓ typo check done (non-blocking)${NC}"
echo ""

echo -e "${BLUE}▶ Noise Sample (SKILL.md)${NC}"
bash "$SKILL_DIR/scripts/score_noise_level.sh" "$SKILL_DIR/SKILL.md" 2>&1 | tail -5 || true
echo ""

echo "═══════════════════════════════════════"
if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}quick_verify: All checks passed${NC}"
    exit 0
else
    echo -e "${RED}quick_verify: $FAILED check(s) failed${NC}"
    exit 1
fi
