#!/usr/bin/env bash
#
# verify_file.sh - RYAN single-file wrapper
# Run version + cross-ref + typo checks on one file
#
set -e

SKILL_DIR=".agents/skills/self-learning-feedback"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [[ $# -lt 1 || "$1" == "--help" || "$1" == "-h" ]]; then
    echo "Usage: $0 <file> [--skill-independent]"
    echo "  Verifies single file: version, typo, cross-refs"
    exit 1
fi

FILE=$1
MODE=""
[[ "${2:-}" == "--skill-independent" ]] && MODE="--skill-independent"

if [[ ! -f "$FILE" ]]; then
    echo -e "${RED}Error: File not found: $FILE${NC}"
    exit 1
fi

FAILED=0
echo -e "${BLUE}Verifying:${NC} $FILE"
echo ""

# Version — check only this file via verify_version_consistency but filter output
echo -e "${BLUE}▶ Version${NC}"
# Use grep approach for single file speed
if [[ "$FILE" == *SKILL.md && "$MODE" == "--skill-independent" ]]; then
    sv=$(grep "^version:" "$FILE" 2>/dev/null | head -1 | sed 's/version: *//' | tr -d '[:space:]' | tr -d '"' | tr -d "'")
    if [[ -n "$sv" ]] && echo "$sv" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        echo -e "${GREEN}  ✓ skill version $sv (independent)${NC}"
    else
        echo -e "${RED}  ✗ invalid semver: $sv${NC}"
        FAILED=1
    fi
else
    if bash "$SKILL_DIR/scripts/verify_version_consistency.sh" $MODE --report 2>&1 | grep -q "\"file\":\"$FILE\".*FAIL"; then
        echo -e "${RED}  ✗ version FAIL${NC}"
        FAILED=1
    else
        echo -e "${GREEN}  ✓ version PASS${NC}"
    fi
fi

# Typo
echo -e "${BLUE}▶ Typo${NC}"
if bash "$SKILL_DIR/scripts/verify_typo_misleading.sh" "$FILE" 2>&1 | grep -q "FAIL\|WARN"; then
    echo -e "${YELLOW}  ⚠ typo warnings — see detail:${NC}"
    bash "$SKILL_DIR/scripts/verify_typo_misleading.sh" "$FILE" 2>&1 | tail -20
else
    echo -e "${GREEN}  ✓ no misleading typos${NC}"
fi

# Cross-refs (only if markdown links exist)
if grep -q "\[.*\](.*)" "$FILE" 2>/dev/null; then
    echo -e "${BLUE}▶ Cross-refs${NC}"
    if bash "$SKILL_DIR/scripts/verify_cross_references.sh" --file "$FILE" 2>&1 | grep -q "BROKEN\|FAIL"; then
        echo -e "${RED}  ✗ broken links${NC}"
        bash "$SKILL_DIR/scripts/verify_cross_references.sh" --file "$FILE" 2>&1 | tail -20
        FAILED=1
    else
        echo -e "${GREEN}  ✓ links ok${NC}"
    fi
fi

echo ""
if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}verify_file: PASS${NC}"
    exit 0
else
    echo -e "${RED}verify_file: FAIL${NC}"
    exit 1
fi
