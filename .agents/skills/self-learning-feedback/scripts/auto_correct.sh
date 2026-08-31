#!/usr/bin/env bash
#
# auto_correct.sh - SYNTHESIS Module
# Apply safe, deterministic fixes automatically
#

set -e

DRY_RUN=false
APPLY=false

usage() {
    echo "Usage: $0 [--input <fixes.json>] [--dry-run] [--apply] [--help]"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --input) shift ;; # input file reserved for future use
        --dry-run) DRY_RUN=true ;;
        --apply) APPLY=true ;;
        --help|-h) usage ;;
        *) echo "Unknown: $1"; usage ;;
    esac
    shift
done

echo "=== Auto-Correct ==="
echo ""

# Safety rules: only deterministic, reversible, non-semantic
# For this skill, safe fixes: version header, typo (if single), formatting
# Status claims are NOT safe

SAFE_COUNT=0
UNSAFE_COUNT=0

# In dry-run, report what would be fixed
if [[ "$DRY_RUN" == true ]]; then
    echo "Dry run — would apply safe fixes:"
    echo ""
    # Example: version fixes are safe
    if bash .agents/skills/self-learning-feedback/scripts/verify_version_consistency.sh --skill-independent 2>&1 | grep -q "FAIL"; then
        echo "✅ version header update (safe, deterministic)"
        SAFE_COUNT=$((SAFE_COUNT+1))
    fi
    # Typo fluff removal is safe
    if bash .agents/skills/self-learning-feedback/scripts/score_noise_level.sh .agents/skills/self-learning-feedback/SKILL.md 2>&1 | grep -q "Fluff"; then
        echo "✅ fluff removal (safe, reversible)"
        SAFE_COUNT=$((SAFE_COUNT+1))
    fi
    echo ""
    echo "Would apply $SAFE_COUNT safe fix(es), $UNSAFE_COUNT unsafe skipped"
    echo "Run with --apply to execute safe fixes"
    exit 0
fi

if [[ "$APPLY" == true ]]; then
    echo "Applying safe fixes..."
    applied=0
    # Version fix for product docs (skill-independent)
    if bash .agents/skills/self-learning-feedback/scripts/verify_version_consistency.sh --skill-independent 2>&1 | grep -q "FAIL"; then
        echo "→ Fixing product version headers"
        bash .agents/skills/self-learning-feedback/scripts/verify_version_consistency.sh --skill-independent --fix 2>&1 | tail -5
        applied=$((applied+1))
    fi
    echo ""
    echo "Applied $applied safe fix(es)"
    echo "Unsafe fixes require manual review (use suggest_fixes.sh)"
    exit 0
fi

# Default: show help
usage
