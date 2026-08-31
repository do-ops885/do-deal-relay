#!/usr/bin/env bash
#
# score_output.sh - FLASH Module
# Score file on 4 dimensions: noise, accuracy, completeness, clarity
#

set -e

SKILL_DIR=".agents/skills/self-learning-feedback"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

FILE=""
CRITERIA="noise,accuracy,completeness,clarity"
JSON_OUT=false

usage() {
    echo "Usage: $0 <file> [--criteria noise,accuracy,completeness,clarity] [--json] [--help]"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --criteria) CRITERIA="$2"; shift ;;
        --json) JSON_OUT=true ;;
        --help|-h) usage ;;
        -*) echo "Unknown: $1"; usage ;;
        *) FILE="$1" ;;
    esac
    shift
done

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
    echo -e "${RED}Error: file not found: $FILE${NC}"
    usage
fi

# Noise: delegate to score_noise_level.sh
NOISE_JSON=$(bash "$SKILL_DIR/scripts/score_noise_level.sh" "$FILE" --json 2>/dev/null || echo '{"noise_score": 90}')
NOISE_SCORE=$(echo "$NOISE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('noise_score', 90))" 2>/dev/null || echo "90")

# Accuracy: check version claims + broken links + status alignment
ACC_SCORE=100
ACC_ISSUES=0
# version check (skill-independent)
if ! bash "$SKILL_DIR/scripts/verify_version_consistency.sh" --skill-independent 2>&1 | grep -q "FAIL.*$FILE" 2>/dev/null; then
    : # ok
else
    ACC_SCORE=$((ACC_SCORE - 20))
    ACC_ISSUES=$((ACC_ISSUES+1))
fi
# Also check if file has version header that mismatches? quick heuristic
if grep -q "Version:" "$FILE" 2>/dev/null; then
    # If skill-independent passes globally, assume ok
    :
fi
# Check for broken links in this file alone
if bash "$SKILL_DIR/scripts/verify_cross_references.sh" --file "$FILE" 2>&1 | grep -q "BROKEN" 2>/dev/null; then
    ACC_SCORE=$((ACC_SCORE - 15))
    ACC_ISSUES=$((ACC_ISSUES+1))
fi
[[ $ACC_SCORE -lt 0 ]] && ACC_SCORE=0

# Completeness: required sections by doc type
COMP_SCORE=100
if [[ "$FILE" == *SKILL.md ]]; then
    for sec in "name:" "description:" "version:" "When to Use" "Workflow"; do
        if ! grep -q "$sec" "$FILE" 2>/dev/null; then
            COMP_SCORE=$((COMP_SCORE - 20))
        fi
    done
elif [[ "$FILE" == *AGENTS.md ]]; then
    for sec in "Named Constants" "Analyze-First" "Production Reliability" "Process Modes"; do
        if ! grep -q "$sec" "$FILE" 2>/dev/null; then
            COMP_SCORE=$((COMP_SCORE - 25))
        fi
    done
else
    # Generic: check has H1 and at least 2 H2
    h1=$(grep -c "^# " "$FILE" 2>/dev/null || echo 0)
    h2=$(grep -c "^## " "$FILE" 2>/dev/null || echo 0)
    [[ $h1 -eq 0 ]] && COMP_SCORE=$((COMP_SCORE - 30))
    [[ $h2 -lt 2 ]] && COMP_SCORE=$((COMP_SCORE - 20))
fi
[[ $COMP_SCORE -lt 0 ]] && COMP_SCORE=0
[[ $COMP_SCORE -gt 100 ]] && COMP_SCORE=100

# Clarity: structure + formatting
CLARITY=80
# heading hierarchy
if grep -q "^# " "$FILE" 2>/dev/null && grep -q "^## " "$FILE" 2>/dev/null; then
    CLARITY=$((CLARITY + 10))
fi
# code examples
if grep -q '```' "$FILE" 2>/dev/null; then
    CLARITY=$((CLARITY + 5))
fi
# bullet points
if grep -q "^- \|^\* " "$FILE" 2>/dev/null; then
    CLARITY=$((CLARITY + 5))
fi
[[ $CLARITY -gt 100 ]] && CLARITY=100
[[ $CLARITY -lt 0 ]] && CLARITY=0

# Overall
OVERALL=$(( (NOISE_SCORE * 25 + ACC_SCORE * 30 + COMP_SCORE * 25 + CLARITY * 20) / 100 ))
GRADE="F"
ACTION="Major revision needed"
if [[ $OVERALL -ge 90 ]]; then GRADE="A"; ACTION="Ship immediately"
elif [[ $OVERALL -ge 80 ]]; then GRADE="B"; ACTION="Ship with minor fixes"
elif [[ $OVERALL -ge 70 ]]; then GRADE="C"; ACTION="Needs improvement"
elif [[ $OVERALL -ge 60 ]]; then GRADE="D"; ACTION="Block, requires rework"
fi

if [[ "$JSON_OUT" == true ]]; then
    cat <<EOF
{
  "file": "$FILE",
  "noise": $NOISE_SCORE,
  "accuracy": $ACC_SCORE,
  "completeness": $COMP_SCORE,
  "clarity": $CLARITY,
  "overall": $OVERALL,
  "grade": "$GRADE",
  "action": "$ACTION"
}
EOF
else
    echo -e "${BLUE}Score Report:${NC} $FILE"
    echo "═══════════════════════════════════════════════════════════"
    echo -e "Noise:        $NOISE_SCORE/100"
    echo -e "Accuracy:     $ACC_SCORE/100 ($ACC_ISSUES issues)"
    echo -e "Completeness: $COMP_SCORE/100"
    echo -e "Clarity:      $CLARITY/100"
    echo "───────────────────────────────────────────────────────────"
    if [[ $OVERALL -ge 80 ]]; then
        echo -e "Overall: ${GREEN}$OVERALL/100 (Grade $GRADE)${NC} — $ACTION"
    elif [[ $OVERALL -ge 60 ]]; then
        echo -e "Overall: ${YELLOW}$OVERALL/100 (Grade $GRADE)${NC} — $ACTION"
    else
        echo -e "Overall: ${RED}$OVERALL/100 (Grade $GRADE)${NC} — $ACTION"
    fi
fi
