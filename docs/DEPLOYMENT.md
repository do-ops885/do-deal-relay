# Deployment Guide

**Project**: do-deal-relay — Cloudflare Workers deal discovery system  
**Version**: 0.2.0  
**Last Updated**: 2026-04-04

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Local Development Setup](#3-local-development-setup)
4. [KV Namespace Setup](#4-kv-namespace-setup)
5. [D1 Database Setup](#5-d1-database-setup)
6. [Environment Variables & Secrets](#6-environment-variables--secrets)
7. [Deployment](#7-deployment)
8. [CI/CD Pipeline](#8-cicd-pipeline)
9. [Post-Deployment Verification](#9-post-deployment-verification)
10. [Rollback Procedures](#10-rollback-procedures)
11. [Monitoring & Troubleshooting](#11-monitoring--troubleshooting)
12. [EU AI Act Compliance](#12-eu-ai-act-compliance)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                     │
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │  Scheduled  │  │   HTTP API  │  │   MCP Server     │  │
│  │  Cron Jobs  │  │  Endpoints  │  │  (2025-11-25)    │  │
│  │  6h + 9am   │  │             │  │                  │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘  │
│         │                │                   │            │
│  ┌──────▼────────────────▼───────────────────▼─────────┐  │
│  │              Deal Discovery Pipeline                 │  │
│  │  discover → normalize → dedupe → validate → score   │  │
│  │  → stage → publish → verify → finalize              │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │               Storage Layer                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │  KV: 5   │  │  D1 DB   │  │  Webhook System  │   │  │
│  │  │ Namespaces│  │ (SQLite) │  │  (HMAC signed)   │   │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key Components**:
- **5 KV Namespaces**: DEALS_PROD, DEALS_STAGING, DEALS_LOG, DEALS_LOCK, DEALS_SOURCES
- **D1 Database**: Full-text search and advanced deal queries
- **MCP Server**: Model Context Protocol 2025-11-25 for AI agent integration
- **Webhook System**: Event notifications with HMAC signature verification
- **Cron Triggers**: Discovery every 6 hours (`0 */6 * * *`), expiry check at 9am (`0 9 * * *`)

---

## 2. Prerequisites

### Required Accounts & Tools

| Requirement                  | Minimum Version | Purpose                        |
| ---------------------------- | --------------- | ------------------------------ |
| Node.js                      | 24.x            | Runtime & build tooling        |
| npm                          | 10.x+           | Package management             |
| Wrangler CLI                 | 4.79.0+         | Cloudflare Workers deployment  |
| Cloudflare account           | Free tier OK    | Workers, KV, D1 hosting        |
| GitHub account               | —               | Repository & CI/CD             |
| GitHub CLI (`gh`)            | 2.x+            | Repository management          |

### Install Wrangler CLI

```bash
# Global install (recommended)
npm install -g wrangler@4.79.0

# Or use via npx (no global install needed)
npx wrangler --version
```

### Authenticate with Cloudflare

```bash
wrangler login
# Opens browser for OAuth flow
# Verify with:
wrangler whoami
```

### Required Cloudflare Permissions

Your API token needs these permissions (use the **Edit Cloudflare Workers** template):

| Permission              | Access   |
| ----------------------- | -------- |
| Account:Workers Scripts | Edit     |
| Account:Workers KV      | Edit     |
| Account:Workers D1      | Edit     |
| Zone:Zone               | Read     |

Create a token at: https://dash.cloudflare.com/profile/api-tokens

---

## 3. Local Development Setup

### Clone & Install

```bash
git clone https://github.com/do-ops885/do-deal-relay.git
cd do-deal-relay
npm install
```

### Run Quality Gate

```bash
./scripts/quality_gate.sh
# Runs: TypeScript compilation, unit tests, validation gates, security checks
```

### Start Development Server

```bash
npm run dev
# Equivalent to: npx wrangler dev
```

Server runs at `http://localhost:8787`. Test endpoints:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/deals
curl http://localhost:8787/metrics
curl http://localhost:8787/api/status
curl -X POST http://localhost:8787/api/discover
```

### Useful Scripts

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start local development server       |
| `npm run build`      | Build TypeScript                     |
| `npm test`           | Run tests in watch mode              |
| `npm run test:ci`    | Run tests once (CI mode)             |
| `npm run lint`       | Type check                           |
| `npm run validate`   | Run validation gates                 |
| `npm run format`     | Format code with Prettier            |

---

## 4. KV Namespace Setup

The system uses 5 KV namespaces for different data types:

| Binding        | Purpose                        |
| -------------- | ------------------------------ |
| DEALS_PROD     | Published production deals     |
| DEALS_STAGING  | Staged deals (pre-publish)     |
| DEALS_LOG      | Pipeline execution logs        |
| DEALS_LOCK     | Distributed locking (cron)     |
| DEALS_SOURCES  | Source registry & trust scores |

### Create Namespaces

```bash
# Production namespaces
wrangler kv:namespace create "DEALS_PROD" --env production
wrangler kv:namespace create "DEALS_STAGING" --env production
wrangler kv:namespace create "DEALS_LOG" --env production
wrangler kv:namespace create "DEALS_LOCK" --env production
wrangler kv:namespace create "DEALS_SOURCES" --env production
```

Each command returns a JSON object with the namespace ID:

```json
{"id": "23ee9b8c9e2748e5880f476b8b57a524", "title": "do-deal-relay-DEALS_PROD"}
```

### Update Configuration

Copy the returned IDs into `wrangler.jsonc` (or `wrangler.toml`) under the appropriate environment block. The current production IDs are:

| Binding        | ID                               |
| -------------- | -------------------------------- |
| DEALS_PROD     | `23ee9b8c9e2748e5880f476b8b57a524` |
| DEALS_STAGING  | `b0db85b92fae45c1895152737ab72649` |
| DEALS_LOG      | `1f1a901fd6fb4dffbdcc86aa4a914ba8` |
| DEALS_LOCK     | `e3ab520eafd5430ab72978e78bdd257e` |
| DEALS_SOURCES  | `be3c0fc148b749b49a59aa7cfa23e3ac` |

### Automated KV Setup (GitHub Actions)

Alternatively, run the `kv-setup.yml` workflow manually:

1. Go to **Actions** → **KV Namespace Setup**
2. Select environment (`production`, `staging`, or `both`)
3. Confirm and run

### Verify Namespaces

```bash
wrangler kv:namespace list
```

---

## 5. D1 Database Setup

### Create Database

```bash
# Production database
wrangler d1 create deals-db

# Staging database (optional)
wrangler d1 create deals-db-staging
```

### Update Configuration

Copy the database ID into `wrangler.jsonc` under `env.production.d1_databases`:

```jsonc
"d1_databases": [
  {
    "binding": "DEALS_DB",
    "database_name": "deals-db",
    "database_id": "<YOUR_DATABASE_ID>",
  },
],
```

### Run Migrations

```bash
# Apply migrations to production
wrangler d1 migrations apply deals-db --env production

# Apply migrations to staging
wrangler d1 migrations apply deals-db --env staging

# Apply locally for development
wrangler d1 migrations apply deals-db --local
```

### Verify Database

```bash
# List databases
wrangler d1 list

# Run a test query
wrangler d1 execute deals-db --command "SELECT name FROM sqlite_master WHERE type='table';" --env production
```

---

## 6. Environment Variables & Secrets

### Non-Secret Variables (in wrangler.jsonc)

| Variable                   | Default     | Description                        |
| -------------------------- | ----------- | ---------------------------------- |
| ENVIRONMENT                | production  | Current environment name           |
| GITHUB_REPO                | do-ops885/do-deal-relay | GitHub repository           |
| NOTIFICATION_THRESHOLD     | 100         | High-value deal threshold          |
| MCP_PROTOCOL_VERSION       | 2025-11-25  | MCP protocol version               |
| MCP_RATE_LIMIT_PER_MINUTE  | 60          | MCP rate limit (120 in staging)    |

### Secrets (set via Wrangler)

Secrets are encrypted and stored by Cloudflare. Set them per environment:

```bash
# Production secrets
wrangler secret put GITHUB_TOKEN --env production
wrangler secret put TELEGRAM_BOT_TOKEN --env production
wrangler secret put TELEGRAM_CHAT_ID --env production

# Staging secrets
wrangler secret put GITHUB_TOKEN --env staging
wrangler secret put TELEGRAM_BOT_TOKEN --env staging
wrangler secret put TELEGRAM_CHAT_ID --env staging
```

| Secret                 | Required    | Purpose                        |
| ---------------------- | ----------- | ------------------------------ |
| GITHUB_TOKEN           | HIGH (P1)   | GitHub commits, PR creation    |
| TELEGRAM_BOT_TOKEN     | Optional    | Telegram notifications         |
| TELEGRAM_CHAT_ID       | Optional    | Telegram destination chat      |

### GitHub Actions Secrets

Configure these in your repository at **Settings → Secrets and variables → Actions**:

| Secret                  | Purpose                              |
| ----------------------- | ------------------------------------ |
| CLOUDFLARE_API_TOKEN    | API token for Wrangler deployment    |
| CLOUDFLARE_ACCOUNT_ID   | Cloudflare account ID                |

### Verify Secrets

```bash
# List all secrets (names only, values hidden)
wrangler secret list --env production
wrangler secret list --env staging
```

---

## 7. Deployment

### Environment Model

| Environment | Branch   | Worker Name              | D1 Database     |
| ----------- | -------- | ------------------------ | --------------- |
| Staging     | develop  | do-deal-relay-staging    | deals-db-staging|
| Production  | main     | do-deal-relay            | deals-db        |

### Manual Deployment

```bash
# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### Automated Deployment (GitHub Actions)

**Staging**: Push to `develop` branch triggers automatic staging deployment.

**Production**: Push to `main` branch or create a `v*` tag triggers production deployment.

```bash
# Deploy to staging (push to develop)
git checkout develop
git add .
git commit -m "feat: your changes"
git push origin develop

# Deploy to production (push to main)
git checkout main
git merge develop
git push origin main

# Or deploy with a version tag
git tag v0.2.0
git push origin v0.2.0
```

### Manual Production Deploy via Workflow Dispatch

1. Go to **Actions** → **Deploy - Production**
2. Click **Run workflow**
3. Check "Confirm production deployment"
4. Click **Run workflow**

---

## 8. CI/CD Pipeline

### Workflow Overview

| Workflow                  | Trigger                        | Purpose                        |
| ------------------------- | ------------------------------ | ------------------------------ |
| `ci.yml`                  | PR / push to main, develop     | Quality gate, tests, security  |
| `deploy-staging.yml`      | Push to develop                | Deploy to staging              |
| `deploy-production.yml`   | Push to main / v* tag          | Deploy to production           |
| `kv-setup.yml`            | Manual dispatch                | Create KV namespaces           |
| `security.yml`            | Scheduled / PR                 | Security scanning              |
| `dependencies.yml`        | Scheduled                      | Dependency updates             |
| `discovery.yml`           | Scheduled                      | Deal discovery pipeline        |
| `cleanup.yml`             | Scheduled                      | Resource cleanup               |

### CI Pipeline (ci.yml)

Runs on every PR and push to `main`/`develop`:

1. **Quality Gate** — TypeScript compilation, tests, validation, security, file organization
2. **Unit Tests** — Full test suite with coverage upload to Codecov
3. **Validation Gates** — Code validation checks
4. **Security Scan** — TruffleHog secret detection + hardcoded secrets check
5. **Lint & Format** — Prettier formatting + type check
6. **Build Check** — TypeScript build verification

### Production Deployment Pipeline (deploy-production.yml)

1. **Pre-Deploy Checks** — Quality gate, test suite, staging health verification
2. **Deploy** — Wrangler deploy to production environment
3. **Health Verification** — 5 retries with 10s intervals
4. **KV Seeding** — Auto-seed on fresh deployments (health=503)
5. **Smoke Tests** — Health, metrics, deals, API status endpoints
6. **Discovery Trigger** — Initial discovery pipeline run
7. **Release Creation** — Auto-create GitHub release on `v*` tags
8. **Failure Notification** — Creates GitHub issue with deduplication

### Staging Deployment Pipeline (deploy-staging.yml)

1. Type check
2. Test suite
3. Wrangler deploy to staging
4. Health verification (5 retries)
5. Smoke tests (health, metrics, deals, API status)

### Concurrency

- `deploy-production`: No cancel-in-progress (safe deployments)
- `deploy-staging`: No cancel-in-progress
- `ci`: Cancel-in-progress enabled for PRs

---

## 9. Post-Deployment Verification

### Automated Checks

The CI/CD pipeline runs these automatically after deployment:

```bash
# Health check (5 retries, 10s apart)
curl -sf https://do-deal-relay.<account>.workers.dev/health

# Metrics endpoint
curl -sf https://do-deal-relay.<account>.workers.dev/metrics

# Deals endpoint (200 or 404 for fresh deployments)
curl -sf https://do-deal-relay.<account>.workers.dev/deals

# API status
curl -sf https://do-deal-relay.<account>.workers.dev/api/status
```

### Manual Verification Checklist

```bash
ACCOUNT_ID="<your-cloudflare-account-id>"
PROD_URL="https://do-deal-relay.${ACCOUNT_ID}.workers.dev"

# 1. Health check
curl -s "${PROD_URL}/health" | jq .

# 2. Pipeline status
curl -s "${PROD_URL}/api/status" | jq .

# 3. Recent logs
curl -s "${PROD_URL}/api/log" | jq .

# 4. Metrics (Prometheus format)
curl -s "${PROD_URL}/metrics"

# 5. Trigger manual discovery
curl -sf -X POST "${PROD_URL}/api/discover"

# 6. Wait and check deals
sleep 5
curl -s "${PROD_URL}/deals" | jq .

# 7. Verify cron triggers
wrangler triggers list --env production

# 8. Check MCP server
curl -s "${PROD_URL}/mcp/v1/info" | jq .
```

### Expected Health Response

```json
{
  "status": "healthy",
  "environment": "production",
  "version": "0.2.0",
  "timestamp": "2026-04-04T..."
}
```

### KV Seeding (Fresh Deployments)

For fresh deployments, the pipeline auto-seeds KV by triggering discovery. Verify:

```bash
# Check if KV has data
wrangler kv:key list --namespace-id 23ee9b8c9e2748e5880f476b8b57a524 --env production
```

---

## 10. Rollback Procedures

### Quick Rollback via Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages
2. Select `do-deal-relay` (production) or `do-deal-relay-staging` (staging)
3. Go to **Deployments** tab
4. Find the previous healthy deployment
5. Click **Rollback**

### Rollback via Wrangler

```bash
# List recent deployments
wrangler deployments list --name do-deal-relay --env production

# Rollback to a specific deployment ID
wrangler deployments rollback <DEPLOYMENT_ID> --name do-deal-relay --env production
```

### Rollback via Git

```bash
# Find last known good commit
git log --oneline -10

# Checkout and redeploy
git checkout <last-good-commit>
wrangler deploy --env production
```

### Automated Rollback (CI/CD)

The production deployment workflow includes a `rollback-on-failure` job that:
1. Lists recent deployments
2. Creates a GitHub issue with `deployment,production,rollback` labels
3. Logs rollback instructions

### Rollback Scenarios

| Scenario                  | Action                                          |
| ------------------------- | ----------------------------------------------- |
| Deploy fails              | Fix issue, redeploy — no rollback needed        |
| Worker unhealthy (503)    | Rollback to previous deployment                 |
| KV data corruption        | Clear snapshot, re-seed via `/api/discover`     |
| Secrets compromised       | Delete secrets, rotate tokens, redeploy         |
| Cron not running          | Redeploy to re-register triggers                |
| Complete failure          | Delete worker, recreate from scratch            |

### Post-Rollback Verification

```bash
# Verify health restored
curl -sf https://do-deal-relay.<account>.workers.dev/health

# Verify all endpoints
curl -sf https://do-deal-relay.<account>.workers.dev/metrics
curl -sf https://do-deal-relay.<account>.workers.dev/deals
curl -sf https://do-deal-relay.<account>.workers.dev/api/status

# Verify cron still registered
wrangler triggers list --env production
```

---

## 11. Monitoring & Troubleshooting

### Monitoring Endpoints

| Endpoint       | Purpose                        | Expected Status |
| -------------- | ------------------------------ | --------------- |
| `/health`      | Worker health status           | 200             |
| `/metrics`     | Prometheus-compatible metrics  | 200             |
| `/api/status`  | Pipeline state                 | 200             |
| `/api/log`     | Recent pipeline logs           | 200             |

### View Logs

```bash
# Live log streaming
wrangler tail --env production

# Via API
curl https://do-deal-relay.<account>.workers.dev/api/log
```

### Common Issues

#### Worker Not Responding

```bash
# Check deployment status
wrangler deployments list --name do-deal-relay --env production

# Check for errors in logs
wrangler tail --env production
```

#### KV Operations Failing

```bash
# Verify namespace bindings
wrangler kv:namespace list

# Check specific namespace
wrangler kv:key list --namespace-id <ID> --env production
```

#### Cron Not Triggering

```bash
# Verify triggers
wrangler triggers list --env production

# Manual trigger as workaround
curl -X POST https://do-deal-relay.<account>.workers.dev/api/discover
```

#### D1 Database Errors

```bash
# Check database status
wrangler d1 list

# Test connectivity
wrangler d1 execute deals-db --command "SELECT 1;" --env production
```

#### MCP Server Issues

```bash
# Check MCP info endpoint
curl https://do-deal-relay.<account>.workers.dev/mcp/v1/info

# List available tools
curl -X POST https://do-deal-relay.<account>.workers.dev/mcp/v1/tools/list
```

### Debug Mode

```bash
# Deploy with debug output
wrangler deploy --env production --verbose

# Local development with debug
wrangler dev --env production --log-level debug
```

### Health Check Monitoring Script

```bash
#!/bin/bash
# Add to cron for automated monitoring
PROD_URL="https://do-deal-relay.<account>.workers.dev/health"

HEALTH=$(curl -sf "${PROD_URL}" | jq -r '.status' 2>/dev/null)
if [ "$HEALTH" != "healthy" ]; then
  echo "ALERT: Health check failed at $(date -u)"
  # Add your alerting mechanism here
fi
```

---

## 12. EU AI Act Compliance

The system includes EU AI Act compliance logging (Regulation (EU) 2024/1689):

- **Logging Retention**: 180-day retention for all AI system operations
- **Transparency**: All deal discovery operations are logged via `/api/log`
- **Human Oversight**: Pipeline state is queryable via `/api/status`
- **Record Keeping**: DEALS_LOG KV namespace stores execution records

### Compliance Verification

```bash
# Check recent compliance logs
curl -s https://do-deal-relay.<account>.workers.dev/api/log | jq '.[] | select(.compliance == true)'

# Verify log retention
wrangler kv:key list --namespace-id 1f1a901fd6fb4dffbdcc86aa4a914ba8 --env production
```

---

## Quick Reference

### URLs

| Resource          | URL Pattern                                            |
| ----------------- | ------------------------------------------------------ |
| Production        | `https://do-deal-relay.<account>.workers.dev`          |
| Staging           | `https://do-deal-relay-staging.<account>.workers.dev`  |
| Cloudflare Dashboard | `https://dash.cloudflare.com/`                       |
| API Tokens        | `https://dash.cloudflare.com/profile/api-tokens`       |

### Key Commands

```bash
# Deploy
wrangler deploy --env staging        # Staging
wrangler deploy --env production     # Production

# Secrets
wrangler secret put <NAME> --env production
wrangler secret list --env production

# Database
wrangler d1 migrations apply deals-db --env production

# Logs
wrangler tail --env production

# Triggers
wrangler triggers list --env production
```

### Repository

- **GitHub**: https://github.com/do-ops885/do-deal-relay
- **Issues**: https://github.com/do-ops885/do-deal-relay/issues
