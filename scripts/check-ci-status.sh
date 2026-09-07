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
    raw=$(gh run list --branch main --limit 20 --json conclusion,name,url,headSha,createdAt 2>/dev/null) || {
        echo "⚠ Failed to fetch live CI status — using cached file"
        return 0
    }
    if [ -z "$raw" ] || [ "$raw" = "[]" ]; then
        echo "⚠ No main CI run found — using cached file"
        return 0
    fi
    local failures
    failures=$(echo "$raw" | jq -r '[.[] | select(.conclusion == "failure") | "\(.name) \(.url)"] | join("; ")' 2>/dev/null)
    # Group by headSha: only evaluate the newest main commit to avoid stale failures
    local latest_sha
    latest_sha=$(echo "$raw" | jq -r 'sort_by(.createdAt) | reverse | .[0].headSha // empty' 2>/dev/null)
    local latest_runs
    latest_runs=$(echo "$raw" | jq -r --arg sha "$latest_sha" '[.[] | select(.headSha == $sha)]' 2>/dev/null)
    local latest_failures
    latest_failures=$(echo "$latest_runs" | jq -r '[.[] | select(.conclusion == "failure") | "\(.name) \(.url)"] | join("; ")' 2>/dev/null)
    if [ -n "$latest_failures" ] && [ "$latest_failures" != "" ]; then
        echo "✗ Live CI (main): FAILING — $latest_failures"
        echo "  Latest main commit $latest_sha has failing workflows. Fix CI before making changes."
        echo "  Run: gh run list --branch main --limit 10  for details"
        return 2
    fi
    if [ -n "$failures" ] && [ "$failures" != "" ]; then
        echo "⚠ Live CI (main): latest commit passing, older failures present — $failures"
    else
        echo "✓ Live CI (main): passing"
    fi
    return 0
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
