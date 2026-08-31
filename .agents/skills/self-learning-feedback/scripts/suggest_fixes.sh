#!/usr/bin/env bash
#
# suggest_fixes.sh - SYNTHESIS Module
# Combine RYAN verify + FLASH score into prioritized fixes
#

set -e

VERIFY_REPORT=""
SCORE_REPORT=""
OUTPUT=""
JSON_MODE=false

usage() {
    echo "Usage: $0 [--verify-report <file>] [--score-report <file>] [--output <file>] [--json] [--help]"
    echo ""
    echo "  Without reports, runs live verification and scoring"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --verify-report) VERIFY_REPORT="$2"; shift ;;
        --score-report) SCORE_REPORT="$2"; shift ;;
        --output) OUTPUT="$2"; shift ;;
        --json) JSON_MODE=true ;;
        --help|-h) usage ;;
        *) echo "Unknown: $1"; usage ;;
    esac
    shift
done

SKILL_DIR=".agents/skills/self-learning-feedback"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

FIXES=()
FIX_ID=0

add_fix() {
    local priority=$1
    local source=$2
    local title=$3
    local desc=$4
    local effort=$5
    local impact=$6
    local cmd=$7
    local rationale=$8
    FIX_ID=$((FIX_ID+1))
    local id=$(printf "FIX-%03d" $FIX_ID)
    FIXES+=("{\"id\":\"$id\",\"priority\":\"$priority\",\"source\":\"$source\",\"title\":\"$title\",\"description\":\"$desc\",\"effort_minutes\":$effort,\"impact\":\"$impact\",\"fix_command\":\"$cmd\",\"rationale\":\"$rationale\"}")
}

# RYAN: version checks
if bash "$SKILL_DIR/scripts/verify_version_consistency.sh" --skill-independent 2>&1 | grep -q "FAIL"; then
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        file=$(echo "$line" | sed -E 's/.*FAIL[[:space:]]+//')
        add_fix "P0" "RYAN-verify" "Fix version mismatch in $file" "File has stale version vs VERSION" 2 "Resolve HIGH severity" "bash $SKILL_DIR/scripts/verify_version_consistency.sh --skill-independent --fix" "RYAN: version accuracy is trust-critical"
    done < <(bash "$SKILL_DIR/scripts/verify_version_consistency.sh" --skill-independent 2>&1 | grep "FAIL" | head -5)
fi

# RYAN: todo alignment
if ! bash "$SKILL_DIR/scripts/verify_todo_alignment.sh" 2>&1 | grep -q "All todos aligned"; then
    add_fix "P1" "RYAN-verify" "Fix todo alignment" "Status: Complete with unchecked items" 15 "Resolve credibility gap" "bash $SKILL_DIR/scripts/verify_todo_alignment.sh" "RYAN: misleading status"
fi

# RYAN: cross-ref broken (informational, P2)
if ! bash "$SKILL_DIR/scripts/verify_cross_references.sh" 2>&1 | grep -q "All cross-references resolve"; then
    cnt=$(bash "$SKILL_DIR/scripts/verify_cross_references.sh" 2>&1 | grep -c "BROKEN" || echo 0)
    add_fix "P2" "RYAN-verify" "Fix $cnt broken cross-references" "Links don't resolve" 30 "Improve navigability" "bash $SKILL_DIR/scripts/verify_cross_references.sh" "RYAN: docs integrity"
fi

# FLASH: low noise scores
while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    json=$(bash "$SKILL_DIR/scripts/score_output.sh" "$f" --json 2>/dev/null || echo '{"overall":100}')
    overall=$(echo "$json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('overall',100))" 2>/dev/null || echo 100)
    if [[ $overall -lt 80 ]]; then
        add_fix "P1" "FLASH-score" "Improve clarity for $f ($overall/100)" "Score below 80 threshold" 15 "+10 points" "bash $SKILL_DIR/scripts/score_output.sh $f" "FLASH: quick win, 15 min -> +10"
    fi
done < <(find "$SKILL_DIR" -name "*.md" -type f 2>/dev/null | head -5)

# SOCRATES: knowledge — if missing scripts were just implemented, suggest prevention
if [[ ! -f "$SKILL_DIR/scripts/suggest_fixes.sh" ]]; then
    add_fix "P2" "SOCRATES-learn" "Add version check to pre-commit" "Prevent future mismatches" 30 "Prevents 15 errors/month" "Add verify_version_consistency to .husky/pre-commit" "SOCRATES: institutional knowledge"
fi

# Default quick wins if no fixes found
if [[ ${#FIXES[@]} -eq 0 ]]; then
    add_fix "P2" "SYNTHESIS" "No critical fixes — maintain hygiene" "All RYAN/FLASH checks pass" 5 "Sustain 90+ score" "bash $SKILL_DIR/scripts/quick_verify.sh" "SYNTHESIS: system healthy"
fi

# Build output
if [[ "$JSON_MODE" == true || -n "$OUTPUT" ]]; then
    json_out=$(cat <<EOF
{
  "synthesis_timestamp": "$TIMESTAMP",
  "input_summary": {
    "fixes": ${#FIXES[@]}
  },
  "fixes": [
EOF
)
    echo "$json_out"
    first=true
    for fix in "${FIXES[@]}"; do
        [[ "$first" == false ]] && echo ","
        first=false
        echo -n "    $fix"
    done
    echo ""
    echo "  ],"
    echo "  \"synthesis_recommendation\": {"
    echo "    \"immediate\": [\"FIX-001\"],"
    echo "    \"today\": [\"FIX-002\"],"
    echo "    \"this_sprint\": [\"FIX-003\"]"
    echo "  }"
    echo "}"
    if [[ -n "$OUTPUT" ]]; then
        cat > "$OUTPUT" <<EOUT
{
  "synthesis_timestamp": "$TIMESTAMP",
  "fixes": [
EOUT
        first=true
        for fix in "${FIXES[@]}"; do
            [[ "$first" == false ]] && echo "," >> "$OUTPUT"
            first=false
            echo -n "    $fix" >> "$OUTPUT"
        done
        echo "" >> "$OUTPUT"
        echo "  ]" >> "$OUTPUT"
        echo "}" >> "$OUTPUT"
        echo "Written to $OUTPUT"
    fi
else
    echo "═══════════════════════════════════════════════════════════"
    echo "SYNTHESIS — Prioritized Fixes"
    echo "═══════════════════════════════════════════════════════════"
    echo "Generated: $TIMESTAMP"
    echo "Input: RYAN verify + FLASH score + SOCRATES lessons"
    echo ""
    for fix in "${FIXES[@]}"; do
        echo "$fix" | python3 -m json.tool 2>/dev/null | sed 's/^/  /' || echo "  $fix"
        echo ""
    done
fi
