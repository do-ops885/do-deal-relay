#!/usr/bin/env bash
# Launch-readiness preflight (issues #994, #996, #997).
#
# Read-only: inspects the repo, never touches prod (no wrangler writes,
# no migrations, no queue creation, no secret handling). Exit 0 when all
# repo-side checks pass; exit 1 when a repo-side file/expectation is
# missing. Owner-gated items (prod D1 apply, queue creation, vendor +
# paid plan + secret, DO-cutover sprint) are reported as [OWNER] and
# never fail this script.
#
# Usage: bash scripts/check-launch-readiness.sh

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FAILURES=0

pass() { printf '[PASS] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
owner() { printf '[OWNER] %s\n' "$1"; }
section() { printf '\n== %s ==\n' "$1"; }

check_file() {
  if [ -f "$1" ]; then
    pass "$2"
  else
    fail "$2 (missing: $1)"
  fi
}

check_grep() {
  # $1 = file, $2 = ERE pattern, $3 = label
  if [ ! -f "$1" ]; then
    fail "$3 (missing file: $1)"
    return
  fi
  if grep -qE "$2" "$1"; then
    pass "$3"
  else
    fail "$3 (pattern not found in $1)"
  fi
}

check_absent() {
  # $1 = file, $2 = ERE pattern, $3 = label (passes when pattern absent)
  if [ ! -f "$1" ]; then
    fail "$3 (missing file: $1)"
    return
  fi
  if grep -qE "$2" "$1"; then
    fail "$3 (unexpected pattern in $1)"
  else
    pass "$3"
  fi
}

section "#994 ops: production launch readiness (repo-side files)"

check_file "migrations/0007_alert_subscriptions.sql" "#994 D1 migration v13 present"
check_file "migrations/0008_alert_deliveries_aiact.sql" "#994 D1 migration v14 present"
check_file "migrations/0009_missing_runtime_tables.sql" "#994 D1 migration v15 present"
check_file "worker/lib/d1/migrations/schema-part-9.ts" "#994 runtime schema part-9 present"
check_grep "wrangler.jsonc" '"queue": "alert-queue"' "#994 alert-queue producer/consumer configured"
check_grep "wrangler.jsonc" 'alert-queue-dlq' "#994 alert-queue DLQ configured"
check_file "scripts/seed-kv.sh" "#994 KV seed script present"
check_file "scripts/seed-auth.sh" "#994 auth seed script present"
check_file "scripts/seed-local-kv.sh" "#994 local KV seed script present"

owner "#994 apply migrations v13/v14/v15 to production D1 (see .agents/skills/d1-ops runbook)"
owner "#994 create queues in every env: wrangler queues create alert-queue (+ alert-queue-dlq)"
owner "#994 run prod seeding + embedding backfill (KV/D1/Vectorize empty since 2026-06-05)"
owner "#994 confirm Vectorize availability in dashboard; add Reddit app credentials + REDDIT_LIFECYCLE_ENABLED=true (ADR-020)"

section "#996 otel: external OTLP export (repo-side instrumentation)"

check_grep "wrangler.jsonc" '"traces":' "#996 traces block present"
check_grep "wrangler.jsonc" '"enabled": true' "#996 platform traces enabled"
check_grep "worker/validation/pipeline.ts" 'withSpan' "#996 pipeline gates instrumented with withSpan"
check_grep "worker/queues/alert-consumer.ts" 'withSpan' "#996 alert queue consumer instrumented with withSpan"
check_grep "worker/lib/tracing.ts" 'enterSpan' "#996 withSpan degrades gracefully without runtime API"
check_file "docs/opentelemetry-setup.md" "#996 vendor setup guide present"

owner "#996 owner/cost gate: pick OTLP vendor, confirm paid plan, store key via wrangler secret put, uncomment destination in wrangler.jsonc"

section "#997 durable-objects: ADR-017 phase 2 remainder (disposition locked)"

check_absent "worker/durable-objects/pipeline-lock.ts" 'extends DurableObject' "#997 PipelineLock stays a plain class (no runtime cutover)"
check_absent "worker/durable-objects/source-registry.ts" 'extends DurableObject' "#997 SourceRegistry stays a plain class (no runtime cutover)"
check_absent "worker/durable-objects/deal-registry.ts" 'extends DurableObject' "#997 DealRegistry stays a plain class (no runtime cutover)"
check_grep "worker/lib/lock.ts" 'PRIMARY' "#997 PipelineLock DO is primary path per ADR-022"
check_grep "worker/lib/lock.ts" 'fallback' "#997 D1 CAS fallback preserved per ADR-022"
check_grep "worker/lib/do-mirror.ts" 'raceWithTimeout' "#997 registries reachable only via best-effort mirror"
check_file "plans/ADR-035-durable-object-cutover.md" "#997 cutover ADR-035 present (Proposed, trigger-gated)"

owner "#997 cutover needs dedicated sprint + trigger measurement (KV/D1 staleness incident or lost-update repro) before any dual-write work"

printf '\n-- summary --\n'
if [ "$FAILURES" -eq 0 ]; then
  echo "repo-side ready: all file checks passed; remaining items are owner-gated (see [OWNER] above)"
  exit 0
else
  echo "repo-side gaps: ${FAILURES} check(s) failed"
  exit 1
fi
