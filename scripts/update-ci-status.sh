#!/usr/bin/env bash
# Update CI Status Artifact
# Fetches the latest GitHub Actions run and writes status to
# .github/ci-status/ci-status.json
# Exit 0 always (best-effort; warnings on failure)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATUS_DIR="${ROOT_DIR}/.github/ci-status"
STATUS_FILE="${STATUS_DIR}/ci-status.json"

# Ensure directory exists
mkdir -p "${STATUS_DIR}"

# Preflight: gh CLI must be available
if ! command -v gh >/dev/null 2>&1; then
    echo "⚠ gh CLI not found — skipping CI status update"
    exit 0
fi

# Fetch latest main-branch workflow runs (not dependabot branches)
RAW=$(gh run list --branch main --limit 20 \
    --json conclusion,headBranch,headSha,updatedAt,url,name \
    2>&1) || {
    echo "⚠ Failed to fetch workflow runs from GitHub — skipping"
    echo "  $RAW"
    exit 0
}

# Guard against empty or malformed output
if [ -z "$RAW" ] || [ "$RAW" = "[]" ]; then
    echo "⚠ No workflow runs found — writing default passing status"
    cat > "${STATUS_FILE}" <<EOF
{
  "status": "passing",
  "last_run": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "failing_jobs": [],
  "workflow_url": ""
}
EOF
    exit 0
fi

# Evaluate the newest main commit across all workflows (CI, Security, Labels, Deploy)
LATEST_SHA=$(echo "$RAW" | jq -r 'sort_by(.updatedAt) | reverse | .[0].headSha // empty')
BRANCH="main"
UPDATED=$(echo "$RAW" | jq -r --arg sha "$LATEST_SHA" '[.[] | select(.headSha == $sha)] | sort_by(.updatedAt) | reverse | .[0].updatedAt // ""')
URL=$(echo "$RAW" | jq -r --arg sha "$LATEST_SHA" '[.[] | select(.headSha == $sha)] | sort_by(.updatedAt) | reverse | .[0].url // ""')
FAILING_WORKFLOWS=$(echo "$RAW" | jq -r --arg sha "$LATEST_SHA" '[.[] | select(.headSha == $sha and .conclusion == "failure") | .name] | join(", ")')

if [ -n "$FAILING_WORKFLOWS" ] && [ "$FAILING_WORKFLOWS" != "" ]; then
    STATUS="failing"
    # Collect failing job names from the first failing workflow run
    FAIL_URL=$(echo "$RAW" | jq -r --arg sha "$LATEST_SHA" '[.[] | select(.headSha == $sha and .conclusion == "failure")] | .[0].url // empty')
    FAILING_JOBS=$(gh run view "${FAIL_URL}" --json jobs \
        --jq '[.jobs[] | select(.conclusion == "failure") | .name]' 2>/dev/null) \
        || FAILING_JOBS="[]"
    # Fall back to workflow names if job query fails
    if [ "$FAILING_JOBS" = "[]" ] || [ -z "$FAILING_JOBS" ]; then
        FAILING_JOBS=$(echo "$RAW" | jq -c --arg sha "$LATEST_SHA" '[.[] | select(.headSha == $sha and .conclusion == "failure") | .name]')
    fi
else
    STATUS="passing"
    FAILING_JOBS="[]"
fi

# Write status file
cat > "${STATUS_FILE}" <<EOF
{
  "status": "${STATUS}",
  "last_run": "${UPDATED}",
  "failing_jobs": ${FAILING_JOBS},
  "workflow_url": "${URL}"
}
EOF

echo "✓ CI status updated: ${STATUS} (${BRANCH} @ ${UPDATED})"
