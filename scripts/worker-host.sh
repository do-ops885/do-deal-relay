#!/usr/bin/env bash
# scripts/worker-host.sh — Resolve the Cloudflare Worker hostname for an environment.
#
# Prints the bare hostname (no scheme) so callers can prepend https:// and
# append paths.
#
# Why this script exists:
#   The Cloudflare workers.dev URL pattern is `<worker>.<account-subdomain>.workers.dev`.
#   The `account-subdomain` is a slug chosen at account creation (e.g. `do-it-119`),
#   NOT the hex `account_id` returned by the API. There is no Cloudflare API that
#   returns the workers.dev hostname given only `account_id`, so we must rely on
#   the explicit `WORKER_HOST` env var to be set in CI.
#
# Resolution order (first non-empty wins):
#   1. ${WORKER_HOST:-}              — primary (set via GH Actions variable)
#   2. ${CLOUDFLARE_WORKER_HOST:-}   — legacy alias
#   3. ${WORKER_HOST_OVERRIDE:-}     — ad-hoc override (rare; testing)
#   Else: exit 2 with a clear error telling the caller to set WORKER_HOST.
#
# Usage:
#   scripts/worker-host.sh <env> [override]
#
# Args:
#   env         Required. One of: production | staging | dev
#   override    Optional. Custom hostname (e.g. "deals.example.com")
#
# Exit codes:
#   0 — success
#   1 — invalid arguments
#   2 — WORKER_HOST not set (cannot derive workers.dev URL from account_id)
#
# Examples:
#   WORKER_HOST=do-deal-relay.do-it-119.workers.dev \
#     scripts/worker-host.sh production
#   # => do-deal-relay.do-it-119.workers.dev
#
#   WORKER_HOST=deals.example.com scripts/worker-host.sh production
#   # => deals.example.com

set -euo pipefail

usage() {
    sed -n '2,40p' "$0" | sed 's/^# \?//'
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

ENV="$1"
OVERRIDE="${2:-${WORKER_HOST:-${CLOUDFLARE_WORKER_HOST:-${WORKER_HOST_OVERRIDE:-}}}}"

case "${ENV}" in
    production) : ;;  # accepted; used only for documentation
    staging)    : ;;
    dev)        : ;;
    *)
        echo "❌ Invalid env: ${ENV} (expected: production | staging | dev)" >&2
        exit 1
        ;;
esac

if [ -z "${OVERRIDE}" ]; then
    cat >&2 <<EOF
❌ WORKER_HOST is not set.

The Cloudflare workers.dev URL pattern is:
  <worker-name>.<account-subdomain>.workers.dev

The account-subdomain is a slug chosen at account creation (e.g. do-it-119),
not the hex account_id. It cannot be derived from CLOUDFLARE_ACCOUNT_ID.

Action: set WORKER_HOST as a GitHub Actions variable (or env):
  - Production: do-deal-relay.do-it-119.workers.dev
  - Staging:    do-deal-relay-staging.do-it-119.workers.dev

For a custom domain (e.g. deals.example.com), set WORKER_HOST to that domain.

In CI workflows, expose it via:
  env:
    WORKER_HOST: \${{ vars.WORKER_HOST }}
EOF
    exit 2
fi

# Strip any scheme the caller might have included
printf '%s' "${OVERRIDE}" | sed -E 's#^https?://##'
