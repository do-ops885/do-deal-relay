#!/usr/bin/env bash
# Validate a commit message.
# Usage: ./scripts/validate-commit-message.sh <commit-msg-file>

set -euo pipefail

COMMIT_MSG_FILE="${1:-}"

if [ -z "$COMMIT_MSG_FILE" ]; then
    echo "Error: No commit message file specified."
    echo "Usage: $0 <commit-msg-file>"
    exit 1
fi

if [ ! -f "$COMMIT_MSG_FILE" ]; then
    echo "Error: Commit message file not found: $COMMIT_MSG_FILE"
    exit 1
fi

MSG=$(cat "$COMMIT_MSG_FILE")
# Use standard grep for better compatibility in restricted environments
if ! head -n1 "$COMMIT_MSG_FILE" | grep -qE "^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\(.*\))?!?: .+$"; then
    echo "Error: Commit message does not follow conventional commits format."
    echo "Format: <type>(<scope>): <subject>"
    echo "Valid types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test"
    exit 1
fi

# Subject length check (standard for conventional commits)
SUBJECT=$(echo "$MSG" | head -n1)
if [ ${#SUBJECT} -gt 72 ]; then
    echo "Error: Subject line exceeds 72 characters."
    exit 1
fi

exit 0
