#!/usr/bin/env bash
# E2E Authentication Setup Script
# Seeds local KV with test API keys for role-based and expiration testing

set -euo pipefail

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
