#!/usr/bin/env bash
# Check CI Status Artifact
# Reads .github/ci-status/ci-status.json and gates on CI health.
# Exit 0 — status is "passing" or file is missing (warns)
# Exit 2 — status is "failing"
#
# Usage: agents call this before making changes to verify CI is green.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATUS_FILE="${ROOT_DIR}/.github/ci-status/ci-status.json"

# If the file doesn't exist, warn and allow the operation
if [ ! -f "${STATUS_FILE}" ]; then
    echo "⚠ CI status file not found — assuming passing"
    exit 0
fi

# Parse status
STATUS=$(jq -r '.status // "unknown"' "${STATUS_FILE}" 2>/dev/null) || {
    echo "⚠ Could not parse CI status file — assuming passing"
    exit 0
}

case "${STATUS}" in
    passing)
        echo "✓ CI status: passing"
        exit 0
        ;;
    failing)
        LAST_RUN=$(jq -r '.last_run // "unknown"' "${STATUS_FILE}" 2>/dev/null)
        WORKFLOW_URL=$(jq -r '.workflow_url // ""' "${STATUS_FILE}" 2>/dev/null)
        FAILING_JOBS=$(jq -r '.failing_jobs // [] | join(", ")' "${STATUS_FILE}" 2>/dev/null)

        echo "✗ CI status: FAILING (last run: ${LAST_RUN})"
        [ -n "${FAILING_JOBS}" ] && echo "  Failing jobs: ${FAILING_JOBS}"
        [ -n "${WORKFLOW_URL}" ] && echo "  Workflow: ${WORKFLOW_URL}"
        echo ""
        echo "Fix CI before making changes."
        exit 2
        ;;
    *)
        echo "⚠ Unknown CI status '${STATUS}' — assuming passing"
        exit 0
        ;;
esac
