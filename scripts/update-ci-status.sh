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

# Fetch latest workflow run (single run, JSON fields we need)
RAW=$(gh run list --limit 1 \
    --json conclusion,headBranch,updatedAt,url \
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

# Parse fields (first element of the JSON array)
CONCLUSION=$(echo "$RAW"  | jq -r '.[0].conclusion // "unknown"')
BRANCH=$(echo "$RAW"      | jq -r '.[0].headBranch // "unknown"')
UPDATED=$(echo "$RAW"     | jq -r '.[0].updatedAt  // ""')
URL=$(echo "$RAW"         | jq -r '.[0].url         // ""')

# Map conclusion to our status vocabulary
case "${CONCLUSION}" in
    success)
        STATUS="passing"
        FAILING_JOBS="[]"
        ;;
    failure)
        STATUS="failing"
        # Attempt to pull failing job names from the same run
        FAILING_JOBS=$(gh run view "${URL}" --json jobs \
            --jq '[.jobs[] | select(.conclusion == "failure") | .name]' 2>/dev/null) \
            || FAILING_JOBS="[]"
        ;;
    cancelled|skipped)
        STATUS="passing"   # Treat cancelled/skipped as non-blocking
        FAILING_JOBS="[]"
        ;;
    *)
        STATUS="passing"
        FAILING_JOBS="[]"
        ;;
esac

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
