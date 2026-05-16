#!/usr/bin/env bash
set -euo pipefail

repo=""

if command -v gh >/dev/null 2>&1; then
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
fi

if [[ -z "$repo" ]]; then
  echo "ERROR: Unable to determine repo name from gh. Run this from a GitHub repository or set JULES_REPO manually." >&2
  exit 1
fi

if command -v jules >/dev/null 2>&1; then
  echo "Creating new Jules session for repo: $repo"
  if [[ -t 0 ]]; then
    # Interactive terminal - safe to run jules new
    jules new
    exit $?
  else
    echo "WARNING: Non-interactive shell detected. 'jules new' requires a TTY."
    echo "Use 'jules remote new' or set JULES_API_KEY for API fallback."
    if [[ -n "${JULES_API_KEY:-}" ]]; then
      echo "Falling back to Jules API..."
      bash "$(dirname "$0")/jules_api_request.sh" "/v1/repo/check" \
        "{\"repo\":\"$repo\",\"path\":\".\"}"
      exit $?
    fi
    exit 1
  fi
fi

if [[ -z "${JULES_API_KEY:-}" ]]; then
  echo "ERROR: Jules CLI is not installed and JULES_API_KEY is not set." >&2
  exit 1
fi

echo "Using Jules API fallback for repo validation against $repo"

bash "$(dirname "$0")/jules_api_request.sh" "/v1/repo/check" \
  "{\"repo\":\"$repo\",\"path\":\".\"}"
