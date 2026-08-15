#!/usr/bin/env bash
# E2E Authentication Setup Script
# Seeds local KV with test API keys for role-based and expiration testing.
# Optionally obtains a JWT token by spinning up a temporary wrangler dev server.

set -euo pipefail

E2E_JWT_TOKEN_FILE="tests/e2e/.jwt-token"
E2E_JWT_PORT=8788
E2E_JWT_TIMEOUT=90
E2E_BASE_URL="${TEST_BASE_URL:-http://localhost:8787}"
E2E_D1_DATABASE="do-deal-relay"
E2E_ADMIN_KEY_FILE="tests/e2e/.admin-api-key"
E2E_AUTH_FIXTURE_FILE="tests/e2e/.auth-fixtures"

# ============================================================================
# Helper: kill background wrangler process on exit
# ============================================================================
WRANGLER_PID=""
cleanup_wrangler() {
  if [ -n "$WRANGLER_PID" ] && kill -0 "$WRANGLER_PID" 2>/dev/null; then
    echo "Cleaning up temporary wrangler dev server (PID $WRANGLER_PID)..."
    kill "$WRANGLER_PID" 2>/dev/null || true
    wait "$WRANGLER_PID" 2>/dev/null || true
    echo "✓ Wrangler dev server stopped"
  fi
}
trap cleanup_wrangler EXIT

# ============================================================================
# Step 1: Ensure .dev.vars exists with required secrets
# ============================================================================
ensure_dev_vars() {
  if [ ! -f .dev.vars ]; then
    cat > .dev.vars <<'EOF'
WEBHOOK_SECRET=e2e-test-webhook-secret-do-not-use-in-prod
EMAIL_WEBHOOK_SECRET=e2e-test-email-webhook-secret-do-not-use-in-prod
API_ENCRYPTION_KEY=e2e-test-encryption-key-32-chars-ok
JWT_SECRET=e2e-test-jwt-secret-do-not-use-in-prod
EOF
    echo "✓ Created .dev.vars with E2E test secrets"
  else
    # Ensure JWT_SECRET is present (required for JWT auth endpoints)
    if ! grep -q "^JWT_SECRET=" .dev.vars; then
      echo "JWT_SECRET=e2e-test-jwt-secret-do-not-use-in-prod" >> .dev.vars
      echo "✓ Added JWT_SECRET to .dev.vars"
    fi
  fi
}
ensure_dev_vars

# ============================================================================
# Step 2: Seed KV with test API keys
# ============================================================================
echo "Seeding E2E test API keys..."

# Generate per-run fixtures instead of embedding reusable credentials.
ADMIN_API_KEY="${E2E_ADMIN_API_KEY:-ddr_$(openssl rand -hex 16)}"
USER_API_KEY="${E2E_USER_API_KEY:-ddr_$(openssl rand -hex 16)}"
EXPIRED_API_KEY="${E2E_EXPIRED_API_KEY:-ddr_$(openssl rand -hex 16)}"
PHASE4_PASSWORD="${E2E_PHASE4_PASSWORD:-E2EPhase4_$(openssl rand -hex 16)}"
ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-E2EAdmin_$(openssl rand -hex 16)}"
SHARED_PASSWORD="${E2E_SHARED_PASSWORD:-E2EShared_$(openssl rand -hex 16)}"
mkdir -p "$(dirname "$E2E_ADMIN_KEY_FILE")"
printf '%s\n' "$ADMIN_API_KEY" > "$E2E_ADMIN_KEY_FILE"
printf 'ADMIN_API_KEY=%s\nUSER_API_KEY=%s\nEXPIRED_API_KEY=%s\nPHASE4_PASSWORD=%s\nADMIN_PASSWORD=%s\n' \
  "$ADMIN_API_KEY" "$USER_API_KEY" "$EXPIRED_API_KEY" \
  "$PHASE4_PASSWORD" "$ADMIN_PASSWORD" > "$E2E_AUTH_FIXTURE_FILE"
ADMIN_HASH=$(printf '%s' "$ADMIN_API_KEY" | openssl dgst -sha256 | sed 's/.*= //')
USER_HASH=$(printf '%s' "$USER_API_KEY" | openssl dgst -sha256 | sed 's/.*= //')
EXPIRED_HASH=$(printf '%s' "$EXPIRED_API_KEY" | openssl dgst -sha256 | sed 's/.*= //')
npx wrangler kv key put --binding DEALS_SOURCES --local "apikey:$ADMIN_HASH" \
  '{"userId":"e2e-admin","role":"admin","createdAt":"2025-01-01T00:00:00Z","rateLimit":{"requestsPerMinute":100,"requestsPerHour":5000}}'

npx wrangler kv key put --binding DEALS_SOURCES --local "apikey:$USER_HASH" \
  '{"userId":"e2e-user","role":"user","createdAt":"2025-01-01T00:00:00Z","rateLimit":{"requestsPerMinute":60,"requestsPerHour":1000}}'

npx wrangler kv key put --binding DEALS_SOURCES --local "apikey:$EXPIRED_HASH" \
  '{"userId":"e2e-expired","role":"user","createdAt":"2020-01-01T00:00:00Z","expiresAt":"2021-01-01T00:00:00Z","rateLimit":{"requestsPerMinute":1,"requestsPerHour":10}}'

echo "✓ E2E test API keys seeded successfully"

# Seed a production snapshot with active deals so /deals, /deals/ranked and
# /deals/highlights return data instead of 404. The static public/deals.json
# asset only covers /deals.json; the KV snapshot drives the worker routes.
echo "Seeding E2E deals snapshot..."
npx wrangler kv key put --binding DEALS_PROD --local "snapshot:prod" \
  --path tests/fixtures/deals-snapshot.json
echo "✓ E2E deals snapshot seeded successfully"

# ============================================================================
# Step 3: Seed D1 users required by auth/API-key E2E tests
# ============================================================================
# The CI server owns the local D1 instance. Initialize it through the worker,
# register both test accounts through the public auth API, then promote the
# admin fixture with a local-only D1 statement. Production auth code is not
# changed and passwords are still hashed by the registration route.
seed_d1_users() {
  local base_url="${1%/}"
  local init_response
  local register_response
  local admin_register_response
  local promote_response
  local admin_status
  local shared_register_response

  if ! curl -sf "${base_url}/health/live" > /dev/null 2>&1; then
    echo "✗ E2E worker is not reachable at ${base_url}"
    return 1
  fi

  echo "Initializing E2E D1 database..."
  init_response=$(curl -sS -X GET "${base_url}/api/d1/migrations?action=init" \
    -H "X-API-Key: ${ADMIN_API_KEY}" 2>&1) || true
  echo "D1 init: ${init_response}"
  if ! echo "${init_response}" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
    echo "✗ E2E D1 initialization failed"
    return 1
  fi

  echo "Registering E2E phase 4 user..."
  register_response=$(curl -sS -X POST "${base_url}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"e2e-phase4@example.com\",\"password\":\"${PHASE4_PASSWORD}\",\"name\":\"Phase 4 E2E User\"}" 2>&1) || true
  echo "Phase 4 registration: ${register_response}"
  if echo "${register_response}" | grep -q '"error"' && \
    ! echo "${register_response}" | grep -qi 'already registered'; then
    echo "✗ Phase 4 user registration failed"
    return 1
  fi

  echo "Registering E2E admin user..."
  admin_register_response=$(curl -sS -X POST "${base_url}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@example.com\",\"password\":\"${ADMIN_PASSWORD}\",\"name\":\"E2E Admin\"}" 2>&1) || true
  echo "Admin registration: ${admin_register_response}"
  if echo "${admin_register_response}" | grep -q '"error"' && \
    ! echo "${admin_register_response}" | grep -qi 'already registered'; then
    echo "✗ E2E admin registration failed"
    return 1
  fi

  promote_response=$(npx wrangler d1 execute "${E2E_D1_DATABASE}" --local \
    --command "UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';" 2>&1) || true
  echo "Admin role promotion: ${promote_response}"
  if ! echo "${promote_response}" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
    echo "✗ E2E admin role promotion failed"
    return 1
  fi

  admin_status=$(curl -sS -o /dev/null -w "%{http_code}" -X POST \
    "${base_url}/api/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@example.com\",\"password\":\"${ADMIN_PASSWORD}\"}" 2>/dev/null) || true
  if [ "${admin_status}" != "200" ]; then
    echo "✗ E2E admin login verification failed (HTTP ${admin_status})"
    return 1
  fi

  echo "Registering shared E2E API user..."
  shared_register_response=$(curl -sS -X POST "${base_url}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"e2e-test@example.com\",\"password\":\"${SHARED_PASSWORD}\",\"name\":\"E2E Test User\"}" 2>&1) || true
  echo "Shared user registration: ${shared_register_response}"
  if echo "${shared_register_response}" | grep -q '"error"' && \
    ! echo "${shared_register_response}" | grep -qi 'already registered'; then
    echo "✗ Shared E2E user registration failed"
    return 1
  fi

  echo "✓ E2E D1 users seeded and admin login verified"
}

# ============================================================================
# Step 4: Obtain JWT token
# ============================================================================
# Preferred: mint a valid HS256 JWT locally with the known test secret.
# This is deterministic and does not require a running worker.
# Fallback: spin up a temporary wrangler dev server to register+login.
# JWT acquisition is optional — tests skip gracefully if token unavailable.
# Any failure here emits a warning but does NOT block the E2E suite.

acquire_jwt_token_local() {
  echo ""
  echo "Minting E2E JWT token locally (deterministic, no server required)..."
  if node tests/e2e/generate-jwt.mjs > /dev/null 2>&1; then
    if [ -f "$E2E_JWT_TOKEN_FILE" ]; then
      echo "✓ JWT token minted locally"
      return 0
    fi
  fi
  echo "✗ Local JWT minting failed"
  return 1
}

acquire_jwt_token() {
  echo ""
  echo "Obtaining E2E JWT token via temporary wrangler dev server..."

  # Start temporary wrangler dev server on a dedicated port
  npx wrangler dev --config wrangler.e2e.jsonc --port "$E2E_JWT_PORT" \
    > /tmp/e2e-wrangler-${E2E_JWT_PORT}.log 2>&1 &
  WRANGLER_PID=$!
  echo "Started temporary wrangler dev server (PID $WRANGLER_PID) on port $E2E_JWT_PORT"

  # Poll /health/live until server is ready or timeout
  ELAPSED=0
  echo -n "Waiting for wrangler dev server"
  while [ "$ELAPSED" -lt "$E2E_JWT_TIMEOUT" ]; do
    if curl -sf "http://localhost:${E2E_JWT_PORT}/health/live" > /dev/null 2>&1; then
      echo ""
      echo "✓ Wrangler dev server is ready (took ${ELAPSED}s)"
      break
    fi
    echo -n "."
    sleep 2
    ELAPSED=$((ELAPSED + 2))
  done

  if [ "$ELAPSED" -ge "$E2E_JWT_TIMEOUT" ]; then
    echo ""
    echo "✗ Timeout waiting for wrangler dev server on port $E2E_JWT_PORT"
    echo "  Last 20 lines of wrangler log:"
    tail -20 "/tmp/e2e-wrangler-${E2E_JWT_PORT}.log" 2>/dev/null || true
    return 1
  fi

  seed_d1_users "http://localhost:${E2E_JWT_PORT}"

  # Login to obtain a separate JWT used by the broader API E2E tests.
  echo "Logging in E2E phase 4 user..."
  LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:${E2E_JWT_PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"e2e-phase4@example.com\",\"password\":\"${PHASE4_PASSWORD}\"}" 2>&1) || true
  echo "Login: $LOGIN_RESPONSE"

  # Extract accessToken from login response
  JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | npx -y json -q accessToken 2>/dev/null || true)

  # Fallback: manual extraction if json CLI is unavailable
  if [ -z "$JWT_TOKEN" ]; then
    JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
  fi

  if [ -z "$JWT_TOKEN" ]; then
    echo "✗ Failed to obtain JWT token from login response"
    echo "  Response was: $LOGIN_RESPONSE"
    return 1
  fi

  # Persist the token for global-setup.ts to read
  mkdir -p tests/e2e
  echo "$JWT_TOKEN" > "$E2E_JWT_TOKEN_FILE"
  echo "✓ JWT token saved to $E2E_JWT_TOKEN_FILE"

  # Kill the temporary server (also handled by trap, but explicit for clarity)
  kill "$WRANGLER_PID" 2>/dev/null || true
  wait "$WRANGLER_PID" 2>/dev/null || true
  WRANGLER_PID=""

  echo ""
  echo "✓ E2E JWT token acquisition complete"
}

if ! seed_d1_users "${E2E_BASE_URL}"; then
  echo "Falling back to a temporary worker for E2E D1 setup..."
  if ! acquire_jwt_token; then
    echo ""
    echo "⚠ WARNING: E2E D1 setup failed — auth/API-key E2E tests may fail"
  fi
fi

if ! acquire_jwt_token_local; then
  acquire_jwt_token || {
    echo ""
    echo "⚠ WARNING: JWT token acquisition failed — JWT-based E2E tests will be skipped"
    echo "  Tests that only need API keys will still run normally."
  }
fi
