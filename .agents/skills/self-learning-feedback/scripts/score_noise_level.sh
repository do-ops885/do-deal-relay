#!/usr/bin/env bash
#
# score_noise_level.sh - FLASH Module
# Quick noise detection for markdown files
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <file> [--json]"
    echo ""
    echo "Example: $0 README.md"
    exit 1
fi

FILE=$1
JSON_MODE=false

if [[ "$2" == "--json" ]]; then
    JSON_MODE=true
fi

if [[ ! -f "$FILE" ]]; then
    echo -e "${RED}Error: File not found: $FILE${NC}"
    exit 1
fi

# Count metrics
TOTAL_WORDS=$(wc -w < "$FILE")
TOTAL_LINES=$(wc -l < "$FILE")

# Fluff words (high noise, low signal)
FLUFF_WORDS=(
    "very" "really" "quite" "rather" "fairly"
    "basically" "essentially" "actually" "literally"
    "in order to" "due to the fact that" "at this point in time"
    "for all intents and purposes" "as a matter of fact"
)

FLUFF_COUNT=0
FLUFF_FOUND=()

for word in "${FLUFF_WORDS[@]}"; do
    count=$(grep -oi "$word" "$FILE" | wc -l || true)
    if [[ $count -gt 0 ]]; then
        FLUFF_COUNT=$((FLUFF_COUNT + count))
        FLUFF_FOUND+=("$word ($count)")
    fi
done

# Repetition detection (same paragraph structure)
REPETITION_LINES=$(cat "$FILE" | sort | uniq -d | wc -l || true)

# Calculate noise percentage
if [[ $TOTAL_WORDS -gt 0 ]]; then
    FLUFF_PERCENTAGE=$(( (FLUFF_COUNT * 100) / TOTAL_WORDS ))
else
    FLUFF_PERCENTAGE=0
fi

REPETITION_PENALTY=$(( REPETITION_LINES * 2 ))
NOISE_SCORE=$(( 100 - FLUFF_PERCENTAGE - REPETITION_PENALTY ))

# Clamp to 0-100
[[ $NOISE_SCORE -lt 0 ]] && NOISE_SCORE=0
[[ $NOISE_SCORE -gt 100 ]] && NOISE_SCORE=100

# Grade
if [[ $NOISE_SCORE -ge 90 ]]; then
    GRADE="A"
    GRADE_COLOR="$GREEN"
    ACTION="Ship immediately"
elif [[ $NOISE_SCORE -ge 80 ]]; then
    GRADE="B"
    GRADE_COLOR="$GREEN"
    ACTION="Minor cleanup suggested"
elif [[ $NOISE_SCORE -ge 70 ]]; then
    GRADE="C"
    GRADE_COLOR="$YELLOW"
    ACTION="Needs improvement"
elif [[ $NOISE_SCORE -ge 60 ]]; then
    GRADE="D"
    GRADE_COLOR="$RED"
    ACTION="Block, requires rework"
else
    GRADE="F"
    GRADE_COLOR="$RED"
    ACTION="Major revision needed"
fi

# Output
if [[ "$JSON_MODE" == true ]]; then
    cat <<EOF
{
  "file": "$FILE",
  "noise_score": $NOISE_SCORE,
  "metrics": {
    "total_words": $TOTAL_WORDS,
    "total_lines": $TOTAL_LINES,
    "fluff_words": $FLUFF_COUNT,
    "fluff_percentage": $FLUFF_PERCENTAGE,
    "repetition_lines": $REPETITION_LINES
  },
  "fluff_found": [$(printf '"%s",' "${FLUFF_FOUND[@]}" | sed 's/,$//')],
  "grade": "$GRADE",
  "action": "$ACTION"
}
EOF
else
    echo -e "${BLUE}Noise Score Report${NC}"
    echo "═══════════════════════════════════════════════════════════"
    echo "File: $FILE"
    echo ""
    echo -e "Score: ${GRADE_COLOR}${NOISE_SCORE}/100${NC} (Grade: ${GRADE_COLOR}${GRADE}${NC})"
    echo ""
    echo "Metrics:"
    echo "  Total words: $TOTAL_WORDS"
    echo "  Fluff words: $FLUFF_COUNT (${FLUFF_PERCENTAGE}%)"
    echo "  Repetition: $REPETITION_LINES lines"
    echo ""
    
    if [[ ${#FLUFF_FOUND[@]} -gt 0 ]]; then
        echo "Fluff words found:"
        for word in "${FLUFF_FOUND[@]}"; do
            echo "  - $word"
        done
        echo ""
    fi
    
    echo -e "Action: ${GRADE_COLOR}${ACTION}${NC}"
fi
