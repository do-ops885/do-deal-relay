#!/usr/bin/env bash
# Consolidated KV Seed Script
# Seeds all KV namespaces with required data for local dev and production.
# Consolidates: scripts/seed-kv.sh, tests/e2e/setup-auth.sh
#
# Usage:
#   ./scripts/seed-local-kv.sh                # Seed local KV (default)
#   ./scripts/seed-local-kv.sh --local        # Seed local KV (explicit)
#   ./scripts/seed-local-kv.sh --remote       # Seed remote/production KV
#   ./scripts/seed-local-kv.sh --e2e-only     # Only seed E2E test API keys
#   ./scripts/seed-local-kv.sh --verify-only  # Only verify existing seed data
#   ./scripts/seed-local-kv.sh --help         # Show help
#
# Lessons: LESSON-014 (Production KV Setup), swarm-round-3 (--remote flag required)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODE="local"  # default: --local

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --local) MODE="local" ;;
    --remote) MODE="remote" ;;
    --e2e-only) MODE="e2e-only" ;;
    --verify-only) MODE="verify-only" ;;
    --help|-h)
      echo "Consolidated KV Seed Script"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --local       Seed local KV namespaces (default)"
      echo "  --remote      Seed remote/production KV namespaces"
      echo "  --e2e-only    Only seed E2E test API keys"
      echo "  --verify-only Verify existing seed data"
      echo "  --help, -h    Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                 # Seed local KV for development"
      echo "  $0 --remote        # Seed production KV (requires wrangler auth)"
      echo "  $0 --e2e-only      # Only seed E2E test API keys"
      exit 0
      ;;
  esac
done

# Determine wrangler flags
if [ "$MODE" = "remote" ]; then
  STORAGE_FLAG=""
  echo "[MODE] Remote/production KV"
else
  STORAGE_FLAG="--local"
  echo "[MODE] Local KV (development)"
fi

# Namespace IDs (from wrangler.jsonc production bindings)
DEALS_SOURCES_ID="be3c0fc148b749b49a59aa7cfa23e3ac"
DEALS_PROD_ID="23ee9b8c9e2748e5880f476b8b57a524"
DEALS_LOG_ID="1f1a901fd6fb4dffbdcc86aa4a914ba8"
DEALS_LOCK_ID="e3ab520eafd5430ab72978e78bdd257e"
DEALS_STAGING_ID="b0db85b92fae45c1895152737ab72649"

# ============================================================================
# E2E Test API Keys (from tests/e2e/setup-auth.sh)
# ============================================================================

seed_e2e_keys() {
  echo ""
  echo "--- Seeding E2E Test API Keys ---"

  local ADMIN_HASH="36c3c6ac0ed11d5c316838ec88764dba53d2f790446970e30cc50d30afa79a3c"
  local USER_HASH="6d06b29066b183fe10b2978d8e3ad5c2bac0f57740c7f1978fba0edec32dc414"
  local EXPIRED_HASH="8440f560ecef5acc8a755f55176b2847008907591fab695d3d2e0fd0255502fe"

  local ADMIN_VALUE='{"userId":"e2e-admin","role":"admin","createdAt":"2025-01-01T00:00:00Z","rateLimit":{"requestsPerMinute":100,"requestsPerHour":5000}}'
  local USER_VALUE='{"userId":"e2e-user","role":"user","createdAt":"2025-01-01T00:00:00Z","rateLimit":{"requestsPerMinute":60,"requestsPerHour":1000}}'
  local EXPIRED_VALUE='{"userId":"e2e-expired","role":"user","createdAt":"2020-01-01T00:00:00Z","expiresAt":"2021-01-01T00:00:00Z","rateLimit":{"requestsPerMinute":1,"requestsPerHour":10}}'

  if [ "$MODE" = "remote" ]; then
    npx wrangler kv key put --namespace-id "$DEALS_SOURCES_ID" --remote "apikey:${ADMIN_HASH}" "${ADMIN_VALUE}" 2>/dev/null && echo "  ✓ Admin key seeded" || echo "  ✗ Admin key failed"
    npx wrangler kv key put --namespace-id "$DEALS_SOURCES_ID" --remote "apikey:${USER_HASH}" "${USER_VALUE}" 2>/dev/null && echo "  ✓ User key seeded" || echo "  ✗ User key failed"
    npx wrangler kv key put --namespace-id "$DEALS_SOURCES_ID" --remote "apikey:${EXPIRED_HASH}" "${EXPIRED_VALUE}" 2>/dev/null && echo "  ✓ Expired key seeded" || echo "  ✗ Expired key failed"
  else
    npx wrangler kv key put --binding DEALS_SOURCES --local "apikey:${ADMIN_HASH}" "${ADMIN_VALUE}" 2>/dev/null && echo "  ✓ Admin key seeded" || echo "  ✗ Admin key failed"
    npx wrangler kv key put --binding DEALS_SOURCES --local "apikey:${USER_HASH}" "${USER_VALUE}" 2>/dev/null && echo "  ✓ User key seeded" || echo "  ✗ User key failed"
    npx wrangler kv key put --binding DEALS_SOURCES --local "apikey:${EXPIRED_HASH}" "${EXPIRED_VALUE}" 2>/dev/null && echo "  ✓ Expired key seeded" || echo "  ✗ Expired key failed"
  fi
}

# ============================================================================
# Source Registry (from scripts/seed-kv.sh)
# ============================================================================

seed_source_registry() {
  echo ""
  echo "--- Seeding Source Registry ---"

  if [ "$MODE" = "remote" ]; then
    npx wrangler kv key put --namespace-id "$DEALS_SOURCES_ID" --remote "registry" "[]" 2>/dev/null && echo "  ✓ Source registry seeded" || echo "  ✗ Source registry failed"
  else
    npx wrangler kv key put --binding DEALS_SOURCES --local "registry" "[]" 2>/dev/null && echo "  ✓ Source registry seeded" || echo "  ✗ Source registry failed"
  fi
}

# ============================================================================
# Production Snapshot (from scripts/seed-kv.sh)
# ============================================================================

seed_prod_snapshot() {
  echo ""
  echo "--- Seeding Production Snapshot ---"

  local seed_data
  seed_data='{"version":"0.1.5","deals":[],"stats":{"total":0,"active":0,"quarantined":0,"rejected":0,"duplicates":0},"generated_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'","run_id":"seed","trace_id":"seed-'$(date +%s)'","snapshot_hash":"seed-'$(date +%s)'","previous_hash":"","schema_version":"0.1.5"}'

  if [ "$MODE" = "remote" ]; then
    npx wrangler kv key put --namespace-id "$DEALS_PROD_ID" --remote "snapshot:prod" "${seed_data}" 2>/dev/null && echo "  ✓ Production snapshot seeded" || echo "  ✗ Production snapshot failed"
  else
    npx wrangler kv key put --binding DEALS_PROD --local "snapshot:prod" "${seed_data}" 2>/dev/null && echo "  ✓ Production snapshot seeded (local)" || echo "  ✗ Production snapshot failed (local)"
  fi
}

# ============================================================================
# Verify seed data
# ============================================================================

verify_seed() {
  echo ""
  echo "--- Verifying Seed Data ---"

  if [ "$MODE" = "remote" ]; then
    local snapshot
    snapshot=$(npx wrangler kv key get --namespace-id "$DEALS_PROD_ID" --remote "snapshot:prod" 2>/dev/null || echo "")
    if [ -n "$snapshot" ]; then
      echo "  ✓ Production snapshot accessible"
      echo "  Version: $(echo "$snapshot" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)"
    else
      echo "  ✗ Could not read production snapshot"
    fi
  fi

  # Verify by attempting to read one E2E key
  local test_hash
  test_hash=$(npx wrangler kv key get \
    $([ "$MODE" = "remote" ] && echo "--namespace-id $DEALS_SOURCES_ID --remote" || echo "--binding DEALS_SOURCES --local") \
    "apikey:36c3c6ac0ed11d5c316838ec88764dba53d2f790446970e30cc50d30afa79a3c" \
    2>/dev/null | grep -o '"userId":"[^"]*"' || echo "")

  if echo "$test_hash" | grep -q "e2e-admin"; then
    echo "  ✓ E2E admin API key verified"
  else
    echo "  ⚠ Could not verify E2E admin API key (may need wrangler auth)"
  fi
}

# ============================================================================
# Main
# ============================================================================

main() {
  cd "$ROOT_DIR"

  echo "====================================="
  echo "  Consolidated KV Seed Script"
  echo "  Mode: $MODE"
  echo "====================================="

  if [ "$MODE" = "e2e-only" ]; then
    seed_e2e_keys
    echo ""
    echo "✅ E2E test API keys seeded successfully"
    exit 0
  fi

  if [ "$MODE" = "verify-only" ]; then
    verify_seed
    exit 0
  fi

  # Full seeding: source registry + prod snapshot + e2e keys
  seed_source_registry
  seed_prod_snapshot
  seed_e2e_keys

  verify_seed

  echo ""
  echo "====================================="
  echo "✅ KV seeding complete!"
  echo ""
  echo "Next steps:"
  echo "  1. Start dev server: npx wrangler dev --env local"
  echo "  2. Test E2E: SKIP_DEV_SERVER=1 npx playwright test"
  echo "  3. Deploy: npx wrangler deploy --env production"
  echo "====================================="
}

main
