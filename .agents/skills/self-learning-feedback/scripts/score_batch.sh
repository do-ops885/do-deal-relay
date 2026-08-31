#!/usr/bin/env bash
#
# score_batch.sh - FLASH Module
# Score multiple files for comparative analysis
#

SKILL_DIR=".agents/skills/self-learning-feedback"

OUTPUT=""
JSON_MODE=false
DIR=""

usage() {
    echo "Usage: $0 <directory> [--output report.json] [--json] [--help]"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --output) OUTPUT="$2"; shift ;;
        --json) JSON_MODE=true ;;
        --help|-h) usage ;;
        -*) echo "Unknown: $1"; usage ;;
        *) DIR="$1" ;;
    esac
    shift
done

if [[ -z "$DIR" ]]; then
    echo "Error: directory required"
    usage
fi

if [[ ! -e "$DIR" ]]; then
    echo "Error: not found: $DIR"
    exit 1
fi

# Collect md files
FILES=$(find "$DIR" -name "*.md" -type f 2>/dev/null | grep -v node_modules | grep -v ".git" | sort)
if [[ -z "$FILES" ]]; then
    # If DIR is a file, score it
    if [[ -f "$DIR" ]]; then
        FILES="$DIR"
    else
        echo "No markdown files found in $DIR"
        exit 0
    fi
fi

# Score each
declare -a RESULTS
TOTAL=0
SUM=0
LOWEST_FILE=""
LOWEST_SCORE=101
HIGHEST_FILE=""
HIGHEST_SCORE=-1

while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    json=$(bash "$SKILL_DIR/scripts/score_output.sh" "$f" --json 2>/dev/null || echo '{"overall":0,"grade":"F","noise":0,"accuracy":0,"completeness":0,"clarity":0}')
    overall=$(echo "$json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('overall',0))" 2>/dev/null || echo 0)
    grade=$(echo "$json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('grade','F'))" 2>/dev/null || echo F)
    noise=$(echo "$json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('noise',0))" 2>/dev/null || echo 0)
    acc=$(echo "$json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('accuracy',0))" 2>/dev/null || echo 0)
    comp=$(echo "$json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('completeness',0))" 2>/dev/null || echo 0)
    clarity=$(echo "$json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('clarity',0))" 2>/dev/null || echo 0)
    RESULTS+=("$f|$noise|$acc|$comp|$clarity|$overall|$grade")
    SUM=$((SUM + overall))
    TOTAL=$((TOTAL + 1))
    if [[ $overall -lt $LOWEST_SCORE ]]; then LOWEST_SCORE=$overall; LOWEST_FILE="$f"; fi
    if [[ $overall -gt $HIGHEST_SCORE ]]; then HIGHEST_SCORE=$overall; HIGHEST_FILE="$f"; fi
done <<< "$FILES"

AVG=0
[[ $TOTAL -gt 0 ]] && AVG=$((SUM / TOTAL))

if [[ "$JSON_MODE" == true ]]; then
    echo "{"
    echo "  \"directory\": \"$DIR\","
    echo "  \"average\": $AVG,"
    echo "  \"total\": $TOTAL,"
    echo "  \"lowest\": {\"file\": \"$LOWEST_FILE\", \"score\": $LOWEST_SCORE},"
    echo "  \"highest\": {\"file\": \"$HIGHEST_FILE\", \"score\": $HIGHEST_SCORE},"
    echo "  \"files\": ["
    first=true
    for r in "${RESULTS[@]}"; do
        IFS='|' read -r f n a c cl o g <<< "$r"
        [[ "$first" == false ]] && echo ","
        first=false
        echo -n "    {\"file\": \"$f\", \"noise\": $n, \"accuracy\": $a, \"completeness\": $c, \"clarity\": $cl, \"overall\": $o, \"grade\": \"$g\"}"
    done
    echo ""
    echo "  ]"
    echo "}"
    if [[ -n "$OUTPUT" ]]; then
        echo "  \"output\": \"$OUTPUT\""
    fi
else
    echo "# Batch Scoring Report"
    echo ""
    echo "| File | Noise | Accuracy | Complete | Clarity | Overall | Grade |"
    echo "|------|-------|----------|----------|---------|---------|-------|"
    for r in "${RESULTS[@]}"; do
        IFS='|' read -r f n a c cl o g <<< "$r"
        # Shorten path
        short=${f//$DIR\//}
        echo "| $short | $n | $a | $c | $cl | $o | $g |"
    done
    echo ""
    echo "## Trends"
    echo "- Average score: $AVG (from $TOTAL files)"
    echo "- Lowest: $LOWEST_FILE ($LOWEST_SCORE)"
    echo "- Highest: $HIGHEST_FILE ($HIGHEST_SCORE)"
    echo ""
    if [[ -n "$OUTPUT" ]]; then
        # Also write JSON to file
        bash "$0" "$DIR" --json > "$OUTPUT"
        echo "JSON written to $OUTPUT"
    fi
fi
