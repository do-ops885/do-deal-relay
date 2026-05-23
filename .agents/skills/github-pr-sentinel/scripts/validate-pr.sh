#!/usr/bin/env bash
# Validates PR readiness before submission

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"

echo "🔍 Running PR Sentinel Validation..."

ERRORS=()
WARNINGS=()

# Check 1: Quality gates
if ! ./scripts/quality_gate.sh >/dev/null 2>&1; then
    ERRORS+=("Quality gates failed. Run: ./scripts/quality_gate.sh")
fi

# Check 2: Git status
if [ -n "$(git status --porcelain)" ]; then
    ERRORS+=("Uncommitted changes detected. Commit or stash before creating PR.")
fi

# Check 3: Branch name convention
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
if [[ ! "$BRANCH_NAME" =~ ^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)/ ]]; then
    WARNINGS+=("Branch name '$BRANCH_NAME' does not follow conventional format.")
fi

# Check 4: Merge base currency
git fetch origin main 2>/dev/null || true
MERGE_BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "")
MAIN_HEAD=$(git rev-parse origin/main 2>/dev/null || echo "")

if [ -n "$MERGE_BASE" ] && [ -n "$MAIN_HEAD" ] && [ "$MERGE_BASE" != "$MAIN_HEAD" ]; then
    WARNINGS+=("Branch is behind origin/main. Consider rebasing.")
fi

# Report results
if [ ${#ERRORS[@]} -ne 0 ]; then
    echo "❌ PR Validation Failed:"
    for err in "${ERRORS[@]}"; do
        echo "  - $err"
    done
    exit 1
fi

if [ ${#WARNINGS[@]} -ne 0 ]; then
    echo "⚠️  Warnings:"
    for warn in "${WARNINGS[@]}"; do
        echo "  - $warn"
    done
fi

echo "✅ PR Ready for Submission"
exit 0
