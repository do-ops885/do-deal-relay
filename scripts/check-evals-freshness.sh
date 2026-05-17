#!/usr/bin/env bash
#
# Guard Rail 10 (CI): Skill Eval Freshness Check
# Runs generate_evals.py for each skill and diffs against committed evals.json
# Exits non-zero if any skill has stale evals.
#
# Usage: ./scripts/check-evals-freshness.sh
#

set -euo pipefail

ERRORS=0

# Find all skills that have a generate_evals.py script
while IFS= read -r gen_script; do
    skill_dir="$(dirname "$(dirname "$gen_script")")"
    evals_file="$skill_dir/evals/evals.json"
    skill_name="$(basename "$skill_dir")"

    echo "🔍 Checking evals freshness for skill: $skill_name"

    if [ ! -f "$evals_file" ]; then
        echo "   ⚠️  No evals.json found at $evals_file — run generate_evals.py first"
        ERRORS=$((ERRORS + 1))
        continue
    fi

    # Save current evals.json
    tmp_before=$(mktemp)
    cp "$evals_file" "$tmp_before"

    # Regenerate evals from skill content
    if python3 "$gen_script" > /dev/null 2>&1; then
        # Run Prettier on generated output to match project formatting
        if command -v npx >/dev/null 2>&1; then
            npx prettier --write "$evals_file" > /dev/null 2>&1 || true
        fi
        # Compare with previous version
        if ! diff -q "$evals_file" "$tmp_before" > /dev/null 2>&1; then
            echo "   ❌ evals.json is STALE — skill content changed but evals.json was not updated"
            echo "   ↳ Run: python3 $gen_script && npx prettier --write $evals_file"
            echo "   ↳ Then commit the updated evals.json"
            ERRORS=$((ERRORS + 1))
        else
            echo "   ✅ evals.json is fresh"
        fi
    else
        echo "   ❌ generate_evals.py failed for $skill_name"
        ERRORS=$((ERRORS + 1))
    fi

    # Restore original evals.json (the generator wrote to it)
    cp "$tmp_before" "$evals_file"
    rm -f "$tmp_before"
done < <(find .agents/skills -name "generate_evals.py" -type f 2>/dev/null || true)

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "❌ $ERRORS skill(s) have stale evals — fix before merging"
    exit 1
fi

echo ""
echo "✅ All skill evals are fresh"
exit 0
