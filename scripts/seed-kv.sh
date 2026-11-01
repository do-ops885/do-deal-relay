#!/usr/bin/env bash
# Production KV Seed Script
# Initializes Cloudflare KV with required seed data for fresh deployments
# Based on LESSON-014: Production Deployment Setup
#
# Destructive-overwrite guard: an existing non-empty key is backed up to
# seed-backup/<UTC timestamp>/ and the write is refused unless --force is
# passed. Use --dry-run to see exactly what would be written.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DRY_RUN=0
FORCE=0
BACKUP_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WRANGLER=()

echo "Production KV Seed Script"
echo "========================"
echo ""

# Resolve wrangler from PATH or the local toolchain.
resolve_wrangler() {
  if command -v wrangler > /dev/null 2>&1; then
    WRANGLER=(wrangler)
  elif command -v npx > /dev/null 2>&1 && npx wrangler --version > /dev/null 2>&1; then
    WRANGLER=(npx wrangler)
  else
    echo "❌ wrangler CLI not found"
    echo "   Install: npm install -g wrangler"
    exit 1
  fi
  echo "✓ wrangler CLI found (${WRANGLER[*]})"
}

# Check authentication
check_auth() {
  if ! "${WRANGLER[@]}" whoami > /dev/null 2>&1; then
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

  local id
  id=$(grep -A 2 "\"binding\": \"${namespace_name}\"" "${ROOT_DIR}/wrangler.jsonc" | grep "\"id\"" | head -1 | sed 's/.*"id": *"\(.*\)".*/\1/')

  if [ -z "$id" ]; then
    echo "❌ Could not find namespace ID for ${namespace_name}"
    echo "   Check wrangler.jsonc for the correct namespace binding"
    exit 1
  fi

  echo "$id"
}

# Read a key, returning empty output when it does not exist.
kv_get() {
  local namespace_id="$1"
  local key="$2"
  "${WRANGLER[@]}" kv key get --namespace-id="${namespace_id}" --remote "${key}" 2>/dev/null || true
}

# Write a key, refusing to clobber existing data without --force.
kv_put_guarded() {
  local namespace_id="$1"
  local key="$2"
  local value="$3"
  local label="$4"
  local existing
  existing="$(kv_get "${namespace_id}" "${key}")"

  if [ "${DRY_RUN}" = "1" ]; then
    echo "  [dry-run] would write ${label} (${key}, ${#value} bytes)"
    if [ -n "${existing}" ]; then
      echo "  [dry-run] key exists (${#existing} bytes): a backup would be written and --force required"
    else
      echo "  [dry-run] key is absent: write is safe"
    fi
    return 0
  fi

  if [ -n "${existing}" ]; then
    local backup_root="${SEED_BACKUP_DIR:-${ROOT_DIR}/seed-backup}"
    local backup_file="${backup_root}/${BACKUP_STAMP}/${label}.json"
    mkdir -p "$(dirname "${backup_file}")"
    printf '%s' "${existing}" > "${backup_file}"
    echo "  ✓ backed up existing ${key} → ${backup_file}"
    if [ "${FORCE}" != "1" ]; then
      echo "  ❌ ${label} already exists; refusing to overwrite" >&2
      echo "     Re-run with --force once the backup above has been reviewed." >&2
      return 1
    fi
  fi

  "${WRANGLER[@]}" kv key put --namespace-id="${namespace_id}" --remote "${key}" "${value}"
}

# Report a completed (or planned) write without claiming a dry run wrote.
report_result() {
  if [ "${DRY_RUN}" = "1" ]; then
    echo "✓ $1 would be seeded (dry run)"
  else
    echo "✓ $1 seeded"
  fi
}

# Seed production snapshot
seed_prod_snapshot() {
  local namespace_id
  namespace_id=$(get_namespace_id "DEALS_PROD")

  echo "Seeding production snapshot..."
  echo "  Namespace ID: ${namespace_id}"

  local version
  version=$(tr -d '[:space:]' < "${ROOT_DIR}/VERSION")
  local seed_data
  seed_data='{"version":"'"${version}"'","deals":[],"stats":{"total":0,"active":0,"quarantined":0,"rejected":0,"duplicates":0},"generated_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'","run_id":"seed","trace_id":"seed-'$(date +%s)'","snapshot_hash":"seed-'$(date +%s)'","previous_hash":"","schema_version":"'"${version}"'"}'

  if kv_put_guarded "${namespace_id}" "snapshot:prod" "${seed_data}" "snapshot-prod"; then
    report_result "Production snapshot"
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

  if kv_put_guarded "${namespace_id}" "registry" "[]" "source-registry"; then
    report_result "Source registry"
  else
    echo "❌ Failed to seed source registry"
    return 1
  fi
}

# Seed referral storage (if configured)
seed_referral_storage() {
  local namespace_id

  if ! grep -q "\"binding\": \"DEALS_REFERRALS\"" "${ROOT_DIR}/wrangler.jsonc" 2>/dev/null; then
    echo "⚠ DEALS_REFERRALS not configured, skipping"
    return 0
  fi

  namespace_id=$(get_namespace_id "DEALS_REFERRALS")

  echo "Seeding referral storage..."
  echo "  Namespace ID: ${namespace_id}"

  if kv_put_guarded "${namespace_id}" "codes" "[]" "referral-codes"; then
    report_result "Referral storage"
  else
    echo "❌ Failed to seed referral storage"
    return 1
  fi
}

# Seed webhook storage (if configured)
seed_webhook_storage() {
  local namespace_id

  if ! grep -q "\"binding\": \"DEALS_WEBHOOKS\"" "${ROOT_DIR}/wrangler.jsonc" 2>/dev/null; then
    echo "⚠ DEALS_WEBHOOKS not configured, skipping"
    return 0
  fi

  namespace_id=$(get_namespace_id "DEALS_WEBHOOKS")

  echo "Seeding webhook storage..."
  echo "  Namespace ID: ${namespace_id}"

  if kv_put_guarded "${namespace_id}" "partners" "[]" "webhook-partners" \
    && kv_put_guarded "${namespace_id}" "subscriptions" "[]" "webhook-subscriptions"; then
    report_result "Webhook storage"
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
  if snapshot=$(kv_get "${prod_namespace_id}" "snapshot:prod") && [ -n "${snapshot}" ]; then
    echo "✓ Production snapshot accessible"
    echo "  Version: $(echo "${snapshot}" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)"
    echo "  Active deals: $(echo "${snapshot}" | grep -o '"active":[^,}]*' | cut -d':' -f2)"
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

usage() {
  cat << 'EOF'
Production KV Seed Script

Usage: ./scripts/seed-kv.sh [OPTIONS]

Options:
  --dry-run      Print what would be written; no writes, no backups
  --force        Overwrite existing keys (a backup is still written first)
  --verify-only  Only verify existing seed data
  --help, -h     Show this help message

Safety: existing non-empty keys are backed up to
seed-backup/<UTC timestamp>/ (override with SEED_BACKUP_DIR) and refused
unless --force is passed.

This script initializes Cloudflare KV namespaces with required seed data
for fresh deployments. It reads namespace IDs from wrangler.jsonc and
always writes to remote storage.

Prerequisites:
  - wrangler CLI installed (global or via npx) and authenticated
  - wrangler.jsonc with KV namespace bindings
EOF
}

# Main execution
main() {
  cd "${ROOT_DIR}"

  resolve_wrangler
  check_auth

  echo ""
  if [ "${DRY_RUN}" = "1" ]; then
    echo "DRY RUN: no writes will be performed"
  elif [ "${FORCE}" = "1" ]; then
    echo "FORCE: existing keys will be overwritten after backup (seed-backup/${BACKUP_STAMP}/)"
  else
    echo "Existing keys will be backed up and refused without --force"
  fi
  echo ""

  seed_prod_snapshot
  seed_source_registry
  seed_referral_storage
  seed_webhook_storage

  echo ""
  if [ "${DRY_RUN}" = "1" ]; then
    echo "=================================="
    echo "✅ Dry run complete — nothing was written"
    echo "=================================="
    return 0
  fi

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
VERIFY_ONLY=0
for arg in "$@"; do
  case "${arg}" in
    --help | -h)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --force)
      FORCE=1
      ;;
    --verify-only)
      VERIFY_ONLY=1
      ;;
    *)
      echo "Unknown option: ${arg}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

if [ "${VERIFY_ONLY}" = "1" ]; then
  cd "${ROOT_DIR}"
  resolve_wrangler
  check_auth
  verify_seed
  exit 0
fi

main
