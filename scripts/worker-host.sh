#!/usr/bin/env bash
# scripts/worker-host.sh — Resolve the Cloudflare Worker hostname for an environment.
#
# Prints the bare hostname (no scheme) so callers can prepend https:// and append paths.
#
# Why this script exists:
#   The Cloudflare workers.dev URL pattern is `<worker>.<account-subdomain>.workers.dev`.
#   The `account-subdomain` is a slug chosen at account creation (e.g. `do-it-119`),
#   NOT the hex `account_id` returned by the API. There is no Cloudflare API that
#   returns the workers.dev hostname given only `account_id`, so we must rely on
#   the explicit `WORKER_HOST` to be set in CI.
#
# Recommended setup (2026 best practice) — GitHub Environments:
#   Settings → Environments → production → Variables → WORKER_HOST = do-deal-relay.do-it-119.workers.dev
#   Settings → Environments → staging    → Variables → WORKER_HOST = do-deal-relay-staging.do-it-119.workers.dev
#   When a job declares `environment: production` (or staging), ${{ vars.WORKER_HOST }}
#   auto-resolves to that environment's value. Repo-level WORKER_HOST acts as fallback.
#
# Resolution order (first non-empty wins):
#   1. ${WORKER_HOST:-}              — primary (set via GH Actions variable / env-scoped)
#   2. ${CLOUDFLARE_WORKER_HOST:-}   — legacy alias
#   3. ${WORKER_HOST_OVERRIDE:-}     — ad-hoc override (rare; testing)
#   Else: exit 2 with a clear error telling the caller to set WORKER_HOST.
#
# Usage:
#   scripts/worker-host.sh <env> [override]
#
# Args:
#   env         Required. One of: production | staging | dev (for error context only;
#               resolution does NOT depend on env since a single WORKER_HOST is now
#               expected, scoped via GitHub Environments per job).
#   override    Optional. Custom hostname (e.g. "deals.example.com")
#
# Exit codes:
#   0 — success
#   1 — invalid arguments
#   2 — WORKER_HOST not set
#
# Examples:
#   WORKER_HOST=do-deal-relay.do-it-119.workers.dev scripts/worker-host.sh production
#   # => do-deal-relay.do-it-119.workers.dev
#
#   WORKER_HOST=deals.example.com scripts/worker-host.sh production
#   # => deals.example.com

set -euo pipefail

usage() {
    sed -n '2,38p' "$0" | sed 's/^# \?//'
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

ENV="$1"
OVERRIDE="${2:-}"

# Validate env (for error context; resolution does not depend on it)
case "${ENV}" in
    production|staging|dev) : ;;
    *)
        echo "❌ Invalid env: ${ENV} (expected: production | staging | dev)" >&2
        exit 1
        ;;
esac

# Single WORKER_HOST is the primary path (env-scoped via GitHub Environments).
# Legacy aliases are kept for backward compatibility.
RESOLVED="${OVERRIDE:-${WORKER_HOST:-${CLOUDFLARE_WORKER_HOST:-${WORKER_HOST_OVERRIDE:-}}}}"

if [ -z "${RESOLVED}" ]; then
    cat >&2 <<'EOF'
❌ WORKER_HOST is not set.

Recommended setup (2026 best practice) — GitHub Environments:
  Settings → Environments → production → Variables → WORKER_HOST = do-deal-relay.do-it-119.workers.dev
  Settings → Environments → staging    → Variables → WORKER_HOST = do-deal-relay-staging.do-it-119.workers.dev

When a job declares `environment: production` (or staging), ${{ vars.WORKER_HOST }}
auto-resolves to that environment's value. Repository-level WORKER_HOST acts as
a fallback for jobs that don't pin an environment.

Alternative — single repo variable (only works if both envs share a hostname):
  Settings → Secrets and variables → Actions → Variables → WORKER_HOST = <hostname>

In CI workflows, expose it via:
  env:
    WORKER_HOST: ${{ vars.WORKER_HOST }}
EOF
    exit 2
fi

# Strip any scheme the caller might have included
printf '%s' "${RESOLVED}" | sed -E 's#^https?://##'
