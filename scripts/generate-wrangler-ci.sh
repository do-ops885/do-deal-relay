#!/bin/bash
# Generate wrangler.jsonc for CI environment
# This creates a placeholder config for validation purposes

cat > wrangler.jsonc << 'EOF'
{
  "name": "do-deal-relay",
  "main": "worker/index.ts",
  "compatibility_date": "2026-03-31",
  "triggers": {
    "crons": ["0 */6 * * *", "0 9 * * *", "0 0 * * 0"]
  },
  "kv_namespaces": [
    { "binding": "DEALS_PROD", "id": "placeholder" },
    { "binding": "DEALS_STAGING", "id": "placeholder" },
    { "binding": "DEALS_LOG", "id": "placeholder" },
    { "binding": "DEALS_LOCK", "id": "placeholder" },
    { "binding": "DEALS_SOURCES", "id": "placeholder" }
  ],
  "vars": {
    "ENVIRONMENT": "ci",
    "GITHUB_REPO": "do-ops885/do-deal-relay",
    "NOTIFICATION_THRESHOLD": "100"
  },
  "d1_databases": []
}
EOF

echo "Generated wrangler.jsonc for CI"
