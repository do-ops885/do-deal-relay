#!/usr/bin/env bash
# E2E Authentication Setup Script
# Seeds local KV with test API keys for role-based and expiration testing.
# Optionally obtains a JWT token by spinning up a temporary wrangler dev server.

set -euo pipefail

E2E_JWT_TOKEN_FILE="tests/e2e/.jwt-token"
E2E_JWT_PORT=8788
E2E_JWT_TIMEOUT=90

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

# Admin Key: ddr_admin_test_key_0000000000000000
ADMIN_HASH="36c3c6ac0ed11d5c316838ec88764dba53d2f790446970e30cc50d30afa79a3c"
npx wrangler kv key put --binding DEALS_SOURCES --local "apikey:$ADMIN_HASH" \
  '{"userId":"e2e-admin","role":"admin","createdAt":"2025-01-01T00:00:00Z","rateLimit":{"requestsPerMinute":100,"requestsPerHour":5000}}'

# User Key: ddr_user_test_key_0000000000000000
USER_HASH="6d06b29066b183fe10b2978d8e3ad5c2bac0f57740c7f1978fba0edec32dc414"
npx wrangler kv key put --binding DEALS_SOURCES --local "apikey:$USER_HASH" \
  '{"userId":"e2e-user","role":"user","createdAt":"2025-01-01T00:00:00Z","rateLimit":{"requestsPerMinute":60,"requestsPerHour":1000}}'

# Expired Key: ddr_expired_test_key_0000000000000000
EXPIRED_HASH="8440f560ecef5acc8a755f55176b2847008907591fab695d3d2e0fd0255502fe"
npx wrangler kv key put --binding DEALS_SOURCES --local "apikey:$EXPIRED_HASH" \
  '{"userId":"e2e-expired","role":"user","createdAt":"2020-01-01T00:00:00Z","expiresAt":"2021-01-01T00:00:00Z","rateLimit":{"requestsPerMinute":1,"requestsPerHour":10}}'

echo "✓ E2E test API keys seeded successfully"

# ============================================================================
# Step 3: Obtain JWT token
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
  npx wrangler dev --port "$E2E_JWT_PORT" \
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

  # Initialize D1 database (creates users table via migrations)
  echo "Initializing D1 database..."
  INIT_RESPONSE=$(curl -s -X GET "http://localhost:${E2E_JWT_PORT}/api/d1/migrations?action=init" \
    -H "X-API-Key: ddr_admin_test_key_0000000000000000" 2>&1) || true
  echo "D1 init: $INIT_RESPONSE"

  # Register a test user (idempotent – re-registration returns 400 "already registered")
  echo "Registering E2E test user..."
  REGISTER_RESPONSE=$(curl -s -X POST "http://localhost:${E2E_JWT_PORT}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"e2e-test@example.com","password":"test-password-123","name":"E2E Test User"}' 2>&1) || true
  echo "Register: $REGISTER_RESPONSE"

  # Login to obtain JWT access token
  echo "Logging in E2E test user..."
  LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:${E2E_JWT_PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"e2e-test@example.com","password":"test-password-123"}' 2>&1) || true
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

acquire_jwt_token_local || acquire_jwt_token || {
  echo ""
  echo "⚠ WARNING: JWT token acquisition failed — JWT-based E2E tests will be skipped"
  echo "  Tests that only need API keys will still run normally."
}
