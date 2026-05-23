#!/usr/bin/env bash
# Validates that GitHub Actions workflows use pinned SHA references
# Security best practice: Always pin actions to full 40-character SHAs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

WORKFLOWS_DIR=".github/workflows"

echo "🔒 Validating GitHub Actions SHA pinning..."

if [ ! -d "$WORKFLOWS_DIR" ]; then
    echo "⚠️  Workflows directory not found: $WORKFLOWS_DIR"
    exit 0
fi

TOTAL_PINNED=0
TOTAL_UNPINNED=0
HAS_ERRORS=false

# Find all YAML workflow files
for file in "$WORKFLOWS_DIR"/*.yml "$WORKFLOWS_DIR"/*.yaml; do
    [ -f "$file" ] || continue
    filename=$(basename "$file")
    
    # Check for unpinned action references (using tags like @v1, @v2, @main)
    if grep -qE "uses:\s*[^\s]+@(v[0-9]+|main|master|latest)\b" "$file" 2>/dev/null; then
        echo "✗ $filename: has unpinned actions"
        grep -nE "uses:\s*[^\s]+@(v[0-9]+|main|master|latest)\b" "$file" 2>/dev/null | while read -r line; do
            echo "    $line"
        done
        HAS_ERRORS=true
        count=$(grep -cE "uses:\s*[^\s]+@(v[0-9]+|main|master|latest)\b" "$file" 2>/dev/null || echo 1)
        TOTAL_UNPINNED=$((TOTAL_UNPINNED + count))
    else
        # Count properly pinned SHAs (40 characters)
        pinned_count=$(grep -cE "uses:\s*[^\s]+@[a-f0-9]{40}\b" "$file" 2>/dev/null || true)
        if [ -n "$pinned_count" ] && [ "$pinned_count" -gt 0 ] 2>/dev/null; then
            echo "✓ $filename: $pinned_count pinned actions"
            TOTAL_PINNED=$((TOTAL_PINNED + pinned_count))
        fi
    fi
done

# Report results
echo ""
echo "Summary: $TOTAL_PINNED pinned, $TOTAL_UNPINNED unpinned"

if [ "$HAS_ERRORS" = true ]; then
    echo ""
    echo "❌ SHA Pinning Validation Failed"
    echo ""
    echo "💡 Fix: Update workflows to use full SHA references"
    echo "   Example: actions/checkout@v4 → actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5"
    exit 1
else
    echo "✅ All GitHub Actions are properly pinned to SHAs"
    exit 0
fi
