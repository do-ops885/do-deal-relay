#!/bin/bash
# Generate wrangler.toml for CI environment
# This creates a placeholder config for validation purposes

cat > wrangler.toml << 'EOF'
name = "do-deal-relay"
main = "worker/index.ts"
compatibility_date = "2026-03-31"

[triggers]
crons = ["0 */6 * * *", "0 9 * * *"]

[[kv_namespaces]]
binding = "DEALS_PROD"
id = "placeholder"

[[kv_namespaces]]
binding = "DEALS_STAGING"
id = "placeholder"

[[kv_namespaces]]
binding = "DEALS_LOG"
id = "placeholder"

[[kv_namespaces]]
binding = "DEALS_LOCK"
id = "placeholder"

[[kv_namespaces]]
binding = "DEALS_SOURCES"
id = "placeholder"

[vars]
ENVIRONMENT = "ci"
GITHUB_REPO = "do-ops885/do-deal-relay"
NOTIFICATION_THRESHOLD = "100"
EOF

echo "Generated wrangler.toml for CI"
