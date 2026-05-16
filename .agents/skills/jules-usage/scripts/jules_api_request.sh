#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${JULES_API_KEY:-}" ]]; then
  echo "ERROR: JULES_API_KEY must be set to use the Jules API fallback." >&2
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <endpoint> <json-payload> [extra-curl-args...]" >&2
  echo "Example: $0 /sessions '{"pageSize":10}'" >&2
  echo "Base URL: https://jules.googleapis.com/v1alpha" >&2
  echo "Auth: x-goog-api-key header (NOT Authorization: Bearer)" >&2
  exit 1
fi

endpoint="$1"
payload="$2"
shift 2

curl -sS \
  -H "x-goog-api-key: $JULES_API_KEY" \
  -H "Content-Type: application/json" \
  ${payload:+-d "$payload"} \
  "https://jules.googleapis.com/v1alpha$endpoint" "$@"
