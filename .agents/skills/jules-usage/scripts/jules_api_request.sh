#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${JULES_API_KEY:-}" ]]; then
  echo "ERROR: JULES_API_KEY must be set to use the Jules API fallback." >&2
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <endpoint> <json-payload> [extra-curl-args...]" >&2
  echo "Example: $0 /v1/repo/check '{"repo":"owner/name","path":"."}'" >&2
  exit 1
fi

endpoint="$1"
payload="$2"
shift 2

curl -sS \ 
  -H "Authorization: Bearer $JULES_API_KEY" \ 
  -H "Content-Type: application/json" \ 
  -d "$payload" \ 
  "https://api.jules.google$endpoint" "$@"
