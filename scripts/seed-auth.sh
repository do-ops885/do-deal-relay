#!/usr/bin/env bash
# D1 auth seed dry run.
#
# Reports exactly how many rows each seed statement would add, using
# read-only queries — this script never writes. The writes themselves live in
# scripts/seed-auth.ts (`seedAuth` for roles/permissions,
# `seedTestFixtures` for the dev-only placeholder users and API key).
#
# The role→permission matrix is seeded by migrations/0004, so it is reported
# as owned by migrations rather than re-inserted here.
#
# Usage: ./scripts/seed-auth.sh [--help]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WRANGLER=()

# Mirrors ROLES in scripts/seed-auth.ts.
ROLE_IDS=(admin user viewer api_consumer)

# Mirrors PERMISSIONS in scripts/seed-auth.ts.
PERMISSION_IDS=(
  deals:read deals:write deals:delete
  users:read users:write users:delete
  apikeys:read apikeys:write apikeys:delete
  audit:read pipeline:read pipeline:write
  metrics:read config:read config:write
  referrals:read referrals:write
  profile:read profile:write
)

# Dev-only fixtures: mirrors seedTestFixtures.
FIXTURE_USER_IDS=(test-admin-id test-user-id)
FIXTURE_KEY_IDS=(test-key-id)

resolve_wrangler() {
  if command -v wrangler > /dev/null 2>&1; then
    WRANGLER=(wrangler)
  elif command -v npx > /dev/null 2>&1 && npx wrangler --version > /dev/null 2>&1; then
    WRANGLER=(npx wrangler)
  else
    echo "❌ wrangler CLI not found" >&2
    exit 1
  fi
}

database_name() {
  local name
  name=$(grep -m1 '"database_name"' "${ROOT_DIR}/wrangler.jsonc" | sed 's/.*"database_name": *"\([^"]*\)".*/\1/')
  if [ -z "${name}" ]; then
    echo "❌ Could not read database_name from wrangler.jsonc" >&2
    exit 1
  fi
  echo "${name}"
}

DB_NAME=$(database_name)

# Read a single scalar `n` from `wrangler d1 execute --json`.
single_number() {
  node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      const rows = JSON.parse(raw)[0]?.results ?? [];
      const n = rows[0]?.n;
      if (typeof n !== "number") {
        process.stderr.write("unexpected wrangler output\n");
        process.exit(1);
      }
      process.stdout.write(String(n));
    });
  '
}

query() {
  "${WRANGLER[@]}" d1 execute "${DB_NAME}" --remote --json --command "$1"
}

count_rows() {
  query "SELECT COUNT(*) AS n FROM $1" | single_number
}

# Rows the seed would add: seed ids minus ids already present.
# Uses IN(...) rather than a compound SELECT, which D1 rejects past a few terms.
missing_rows() {
  local table="$1"
  shift
  local ids=("$@")
  local total=${#ids[@]}
  local list
  list=$(printf "'%s'," "${ids[@]}")
  list=${list%,}
  query "SELECT ${total} - COUNT(*) AS n FROM ${table} WHERE id IN (${list})" | single_number
}

print_row() {
  printf '%-22s %10s %12s\n' "$1" "$2" "$3"
}

main() {
  cd "${ROOT_DIR}"
  resolve_wrangler

  echo "D1 auth seed dry run — database: ${DB_NAME}"
  echo "=================================================="
  echo ""
  print_row "table" "existing" "would add"
  print_row "----------------------" "----------" "------------"
  print_row "roles" "$(count_rows roles)" "$(missing_rows roles "${ROLE_IDS[@]}")"
  print_row "permissions" "$(count_rows permissions)" "$(missing_rows permissions "${PERMISSION_IDS[@]}")"
  echo ""
  echo "Dev-only fixtures (never seed these in production):"
  print_row "users" "$(count_rows users)" "$(missing_rows users "${FIXTURE_USER_IDS[@]}")"
  print_row "api_keys" "$(count_rows api_keys)" "$(missing_rows api_keys "${FIXTURE_KEY_IDS[@]}")"
  echo ""
  echo "role_permissions is seeded by migrations/0004, not by this seed."

  echo ""
  echo "Nothing was written. Apply with scripts/seed-auth.ts:"
  echo "  seedAuth(db)         roles and permissions"
  echo "  seedTestFixtures(db) placeholder users and API key (development only)"
}

case "${1:-}" in
  --help | -h)
    cat << 'EOF'
D1 auth seed dry run

Usage: ./scripts/seed-auth.sh

Prints, per table, how many rows exist today and how many the seed
statements in scripts/seed-auth.ts would add. Read-only: performs no writes.

Prerequisites:
  - wrangler CLI installed (global or via npx) and authenticated
EOF
    ;;
  "")
    main
    ;;
  *)
    echo "Unknown option: $1" >&2
    echo "Use --help for usage information" >&2
    exit 1
    ;;
esac
