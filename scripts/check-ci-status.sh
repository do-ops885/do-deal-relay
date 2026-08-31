#!/usr/bin/env bash
# Check CI Status Artifact
# Reads .github/ci-status/ci-status.json and optionally verifies live GitHub status.
# Exit 0 — status is "passing" or file is missing (warns)
# Exit 2 — status is "failing"
#
# Usage: agents call this before making changes to verify CI is green.
#   --live   Also query GitHub API via `gh` and fail if latest main run is failing
#            (uses .github/ci-status/ci-status.json as cache fallback).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATUS_FILE="${ROOT_DIR}/.github/ci-status/ci-status.json"

LIVE_CHECK=false
if [ "${1:-}" = "--live" ]; then
    LIVE_CHECK=true
fi

check_live_ci() {
    if ! command -v gh >/dev/null 2>&1; then
        echo "⚠ gh CLI not found — skipping live CI check"
        return 0
    fi
    if ! command -v jq >/dev/null 2>&1; then
        echo "⚠ jq not found — skipping live CI check"
        return 0
    fi
    local raw
    raw=$(gh run list --limit 5 --json conclusion,headBranch,workflowName,url 2>/dev/null) || {
        echo "⚠ Failed to fetch live CI status — using cached file"
        return 0
    }
    local main_run
    main_run=$(echo "$raw" | jq -r '[.[] | select(.headBranch == "main" and .workflowName == "CI")] | .[0] // empty' 2>/dev/null)
    if [ -z "$main_run" ] || [ "$main_run" = "null" ]; then
        echo "⚠ No main CI run found — using cached file"
        return 0
    fi
    local conclusion
    conclusion=$(echo "$main_run" | jq -r '.conclusion // "unknown"' 2>/dev/null)
    local url
    url=$(echo "$main_run" | jq -r '.url // ""' 2>/dev/null)
    case "$conclusion" in
        success)
            echo "✓ Live CI (main): passing — $url"
            return 0
            ;;
        failure)
            echo "✗ Live CI (main): FAILING — $url"
            echo "  Latest main CI run is failing. Fix CI before making changes."
            echo "  Run: gh run view $url --log-failed  for details"
            return 2
            ;;
        *)
            echo "⚠ Live CI (main): status=$conclusion — $url (treating as passing)"
            return 0
            ;;
    esac
}

# If live check requested, run it first (strict)
if [ "$LIVE_CHECK" = true ]; then
    if ! check_live_ci; then
        exit 2
    fi
fi

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
