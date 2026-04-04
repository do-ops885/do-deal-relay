#!/usr/bin/env bash
# Production KV Seed Script
# Initializes Cloudflare KV with required seed data for fresh deployments
# Based on LESSON-014: Production Deployment Setup

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Production KV Seed Script"
echo "========================"
echo ""

# Check for wrangler
check_wrangler() {
  if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler CLI not found"
    echo "   Install: npm install -g wrangler"
    exit 1
  fi
  echo "✓ wrangler CLI found"
}

# Check authentication
check_auth() {
  if ! wrangler whoami &> /dev/null; then
    echo "❌ Not authenticated with Cloudflare"
    echo "   Run: wrangler login"
    exit 1
  fi
  echo "✓ Authenticated with Cloudflare"
}

# Get namespace ID from wrangler.jsonc
get_namespace_id() {
  local namespace_name="$1"

  if [ ! -f "${ROOT_DIR}/wrangler.jsonc" ]; then
    echo "❌ wrangler.jsonc not found"
    exit 1
  fi

  # Extract namespace ID from wrangler.jsonc
  local id
  id=$(grep -A 2 "\"binding\": \"${namespace_name}\"" "${ROOT_DIR}/wrangler.jsonc" | grep "\"id\"" | head -1 | sed 's/.*"id": *"\(.*\)".*/\1/')

  if [ -z "$id" ]; then
    echo "❌ Could not find namespace ID for ${namespace_name}"
    echo "   Check wrangler.jsonc for the correct namespace binding"
    exit 1
  fi

  echo "$id"
}

# Seed production snapshot
seed_prod_snapshot() {
  local namespace_id
  namespace_id=$(get_namespace_id "DEALS_PROD")

  echo "Seeding production snapshot..."
  echo "  Namespace ID: ${namespace_id}"

  local seed_data
  seed_data='{"version":"0.1.3","deals":[],"stats":{"total":0,"active":0,"quarantined":0,"rejected":0,"duplicates":0},"generated_at":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'","run_id":"seed","trace_id":"seed-'"$(date +%s)"'","snapshot_hash":"seed-'"$(date +%s)"'","previous_hash":"","schema_version":"0.1.3"}'

  if wrangler kv key put --namespace-id="${namespace_id}" "snapshot:prod" "${seed_data}" 2>/dev/null; then
    echo "✓ Production snapshot seeded"
  else
    echo "❌ Failed to seed production snapshot"
    return 1
  fi
}

# Seed empty source registry
seed_source_registry() {
  local namespace_id
  namespace_id=$(get_namespace_id "DEALS_SOURCES")

  echo "Seeding source registry..."
  echo "  Namespace ID: ${namespace_id}"

  local empty_registry
  empty_registry='[]'

  if wrangler kv key put --namespace-id="${namespace_id}" "registry" "${empty_registry}" 2>/dev/null; then
    echo "✓ Source registry seeded"
  else
    echo "❌ Failed to seed source registry"
    return 1
  fi
}

# Seed referral storage (if configured)
seed_referral_storage() {
  local namespace_id

  # Check if DEALS_REFERRALS is configured
  if ! grep -q "\"binding\": \"DEALS_REFERRALS\"" "${ROOT_DIR}/wrangler.jsonc" 2>/dev/null; then
    echo "⚠ DEALS_REFERRALS not configured, skipping"
    return 0
  fi

  namespace_id=$(get_namespace_id "DEALS_REFERRALS")

  echo "Seeding referral storage..."
  echo "  Namespace ID: ${namespace_id}"

  local empty_codes
  empty_codes='[]'

  if wrangler kv key put --namespace-id="${namespace_id}" "codes" "${empty_codes}" 2>/dev/null; then
    echo "✓ Referral storage seeded"
  else
    echo "❌ Failed to seed referral storage"
    return 1
  fi
}

# Seed webhook storage (if configured)
seed_webhook_storage() {
  local namespace_id

  # Check if DEALS_WEBHOOKS is configured
  if ! grep -q "\"binding\": \"DEALS_WEBHOOKS\"" "${ROOT_DIR}/wrangler.jsonc" 2>/dev/null; then
    echo "⚠ DEALS_WEBHOOKS not configured, skipping"
    return 0
  fi

  namespace_id=$(get_namespace_id "DEALS_WEBHOOKS")

  echo "Seeding webhook storage..."
  echo "  Namespace ID: ${namespace_id}"

  local empty_partners
  empty_partners='[]'

  local empty_subscriptions
  empty_subscriptions='[]'

  if wrangler kv key put --namespace-id="${namespace_id}" "partners" "${empty_partners}" 2>/dev/null && \
     wrangler kv key put --namespace-id="${namespace_id}" "subscriptions" "${empty_subscriptions}" 2>/dev/null; then
    echo "✓ Webhook storage seeded"
  else
    echo "❌ Failed to seed webhook storage"
    return 1
  fi
}

# Verify seed data
verify_seed() {
  echo ""
  echo "Verifying seed data..."

  local prod_namespace_id
  prod_namespace_id=$(get_namespace_id "DEALS_PROD")

  local snapshot
  if snapshot=$(wrangler kv key get --namespace-id="${prod_namespace_id}" "snapshot:prod" 2>/dev/null); then
    echo "✓ Production snapshot accessible"
    echo "  Version: $(echo "$snapshot" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)"
    echo "  Active deals: $(echo "$snapshot" | grep -o '"active":[^,}]*' | cut -d':' -f2)"
  else
    echo "❌ Could not verify production snapshot"
    return 1
  fi
}

# Health check after seeding
health_check() {
  echo ""
  echo "Health check..."
  echo "  (After first discovery run, health check will show 'healthy' instead of 'degraded')"
}

# Main execution
main() {
  cd "${ROOT_DIR}"

  check_wrangler
  check_auth

  echo ""
  echo "Starting KV seed process..."
  echo ""

  seed_prod_snapshot
  seed_source_registry
  seed_referral_storage
  seed_webhook_storage

  echo ""
  verify_seed
  health_check

  echo ""
  echo "=================================="
  echo "✅ KV seeding complete!"
  echo ""
  echo "Next steps:"
  echo "  1. Trigger initial discovery: curl -X POST https://your-worker.workers.dev/api/discover"
  echo "  2. Check health: curl https://your-worker.workers.dev/health"
  echo "  3. View metrics: curl https://your-worker.workers.dev/metrics"
  echo ""
  echo "Note: First discovery run will populate the production snapshot"
  echo "      and change health status from 'degraded' to 'healthy'"
  echo "=================================="
}

# Handle command line arguments
case "${1:-}" in
  --help|-h)
    echo "Production KV Seed Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --help, -h     Show this help message"
    echo "  --verify-only  Only verify existing seed data"
    echo ""
    echo "This script initializes Cloudflare KV namespaces with required seed data"
    echo "for fresh deployments. It reads namespace IDs from wrangler.jsonc."
    echo ""
    echo "Prerequisites:"
    echo "  - wrangler CLI installed and authenticated"
    echo "  - wrangler.jsonc with KV namespace bindings"
    echo ""
    exit 0
    ;;
  --verify-only)
    cd "${ROOT_DIR}"
    check_wrangler
    check_auth
    verify_seed
    exit 0
    ;;
  "")
    main
    ;;
  *)
    echo "Unknown option: $1"
    echo "Use --help for usage information"
    exit 1
    ;;
esac
