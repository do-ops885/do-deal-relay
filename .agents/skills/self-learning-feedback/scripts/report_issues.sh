#!/usr/bin/env bash
#
# report_issues.sh - SYNTHESIS Module
# Generate human-readable issue report
#

FORMAT="markdown"
OUTPUT=""

usage() {
    echo "Usage: $0 [--format markdown|json] [--output <file>] [--help]"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --format) FORMAT="$2"; shift ;;
        --output) OUTPUT="$2"; shift ;;
        --help|-h) usage ;;
        *) echo "Unknown: $1"; usage ;;
    esac
    shift
done

SKILL_DIR=".agents/skills/self-learning-feedback"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TMP_FIXES=$(mktemp)

bash "$SKILL_DIR/scripts/suggest_fixes.sh" --json > "$TMP_FIXES" 2>/dev/null || echo '{"fixes":[]}' > "$TMP_FIXES"

if [[ "$FORMAT" == "json" ]]; then
    cat "$TMP_FIXES"
    [[ -n "$OUTPUT" ]] && cp "$TMP_FIXES" "$OUTPUT"
else
    report=$(cat <<EOF
# Issue Report

Generated: $TIMESTAMP
Synthesized from: RYAN verify + FLASH score + SOCRATES lessons

---

EOF
)
    echo "$report"
    # P0/P1/P2 sections from fixes
    fixes_count=$(python3 -c "import json; print(len(json.load(open('$TMP_FIXES')).get('fixes',[])))" 2>/dev/null || echo 0)
    if [[ $fixes_count -eq 0 ]]; then
        echo "## ✅ No critical issues"
        echo ""
        echo "All RYAN/FLASH checks pass. System healthy."
    else
        echo "## 🚨 Issues ($fixes_count)"
        echo ""
        python3 <<PY 2>/dev/null || cat "$TMP_FIXES"
import json
data=json.load(open('$TMP_FIXES'))
for f in data.get('fixes',[]):
    print(f"### {f['id']}: {f['title']} ({f['priority']})")
    print(f"**Source**: {f['source']}")
    print(f"**Impact**: {f['impact']}")
    print(f"**Effort**: {f['effort_minutes']} min")
    print(f"**Fix**: \`{f['fix_command']}\`")
    print(f"**Rationale**: {f['rationale']}")
    print("")
PY
    fi
    echo "---"
    echo ""
    echo "## Summary"
    echo ""
    echo "| Priority | Count | Effort |"
    echo "|----------|-------|--------|"
    echo "| P0 | $(python3 -c "import json; print(sum(1 for f in json.load(open('$TMP_FIXES')).get('fixes',[]) if f['priority']=='P0'))" 2>/dev/null || echo 0) |"
    echo "| P1 | $(python3 -c "import json; print(sum(1 for f in json.load(open('$TMP_FIXES')).get('fixes',[]) if f['priority']=='P1'))" 2>/dev/null || echo 0) |"
    echo "| P2 | $(python3 -c "import json; print(sum(1 for f in json.load(open('$TMP_FIXES')).get('fixes',[]) if f['priority']=='P2'))" 2>/dev/null || echo 0) |"
    echo ""
    echo "_This report synthesizes RYAN rigor, FLASH pragmatism, SOCRATES questioning._"

    if [[ -n "$OUTPUT" ]]; then
        # Re-generate to output file
        bash "$0" --format "$FORMAT" > "$OUTPUT"
        echo ""
        echo "Written to $OUTPUT"
    fi
fi

rm -f "$TMP_FIXES"
