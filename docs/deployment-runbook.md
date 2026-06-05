# Deployment Runbook

**Project**: do-deal-relay (Cloudflare Worker)
**Last Updated**: 2026-06-03
**Maintainer**: do-ops885

This is the single source of truth for deploying, verifying, and rolling back the do-deal-relay worker across staging and production environments.

---

## 1. Prerequisites

Before deploying, ensure you have:

### Tooling

| Requirement | Version | Verify |
|-------------|---------|--------|
| Node.js | 22.x | `node -v` |
| npm | 10.x | `npm -v` |
| Wrangler | 4.79.0+ | `npx wrangler --version` |
| Git | 2.x | `git --version` |

### Access

- **Cloudflare account** with Workers permission (Account ID: visible in dashboard URL)
- **GitHub repo write access** to `do-ops885/do-deal-relay`
- **Cloudflare API token** with Workers/KV/D1 permissions (for CI and manual deploys)

### Infrastructure (must exist before first deploy)

- [ ] 5 KV namespaces created and bound in `wrangler.jsonc` (see Section 2 for IDs)
- [ ] D1 database created and bound in `wrangler.jsonc`
- [ ] Vectorize index `deal-embeddings` (768 dims, cosine metric) — required for semantic search
- [ ] `workers.dev` subdomain registered on the Cloudflare account
- [ ] GitHub Actions secrets configured (see Section 4)

### Local Environment Check

```bash
# Run the quality gate to verify local readiness
./scripts/quality_gate.sh

# Verify TypeScript compiles
npx tsc --noEmit

# Verify tests pass
npm test
```

---

## 2. Required Secrets

Secrets are divided into **Cloudflare Worker secrets** (set via dashboard or wrangler CLI) and **GitHub Actions secrets** (set in repo settings).

### Cloudflare Worker Secrets

These are injected into the worker runtime and are NOT in `wrangler.jsonc`.

#### Required (worker won't start without these)

| Secret | Purpose | How to Generate |
|--------|---------|-----------------|
| `WEBHOOK_SECRET` | HMAC signature verification for incoming webhooks | Generate: `openssl rand -hex 32` |
| `API_ENCRYPTION_KEY` | Encrypts/decrypts sensitive data in KV (min 32 chars) | Generate: `openssl rand -base64 32` |
| `EMAIL_WEBHOOK_SECRET` | HMAC verification for inbound email webhooks | Generate: `openssl rand -hex 32` |

#### Optional (features degrade gracefully without these)

| Secret | Purpose | When Needed |
|--------|---------|-------------|
| `GITHUB_TOKEN` | GitHub API access for commits, PR creation, issue management | GitHub integration features |
| `JWT_SECRET` | Signs JWT tokens for user authentication | Auth-protected API endpoints |
| `JWT_REFRESH_SECRET` | Signs refresh tokens for token rotation | Auth-protected API endpoints |
| `TELEGRAM_BOT_TOKEN` | Sends Telegram notifications | Telegram alerts |
| `TELEGRAM_CHAT_ID` | Target chat for Telegram notifications | Telegram alerts |
| `REDDIT_CLIENT_SECRET` | Reddit API access for deal discovery | Reddit source research |

### GitHub Actions Secrets

These are used by CI/CD workflows to deploy via wrangler.

| Secret | Purpose | Where to Find |
|--------|---------|---------------|
| `CLOUDFLARE_API_TOKEN` | Authenticates wrangler deploys from CI | Cloudflare dashboard → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Identifies the Cloudflare account. Cannot be used to derive the workers.dev hostname — that requires the `account_subdomain` slug (see `WORKER_HOST` variable). | Cloudflare dashboard → right sidebar |

---

## 3. Cloudflare Dashboard Setup

### Setting Worker Secrets via Dashboard

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → select `do-deal-relay` (production) or `do-deal-relay-staging`
3. Go to **Settings** → **Variables and Secrets**
4. Under **Secrets**, click **Add secret**
5. Enter the secret name (e.g., `WEBHOOK_SECRET`) and paste the value
6. Click **Save**

Repeat for each secret. Set secrets on **both** `staging` and `production` worker instances.

### Setting up the Vectorize Index

Required for semantic search (`/api/semantic-search`). Run the **Vectorize Index Setup** workflow from the Actions tab with `confirm: true` to create the `deal-embeddings` index. The index must exist before `wrangler deploy` succeeds.

Manual equivalent:

```bash
# Production
npx wrangler vectorize create "deal-embeddings" \
  --dimensions=768 --metric=cosine --env production

# Staging (if using a separate index)
npx wrangler vectorize create "deal-embeddings-staging" \
  --dimensions=768 --metric=cosine --env staging
```

### Setting Worker Secrets via Wrangler CLI

```bash
# Production
npx wrangler secret put WEBHOOK_SECRET --env production
npx wrangler secret put API_ENCRYPTION_KEY --env production
npx wrangler secret put EMAIL_WEBHOOK_SECRET --env production

# Staging
npx wrangler secret put WEBHOOK_SECRET --env staging
npx wrangler secret put API_ENCRYPTION_KEY --env staging
npx wrangler secret put EMAIL_WEBHOOK_SECRET --env staging

# Optional secrets (production only typically)
npx wrangler secret put GITHUB_TOKEN --env production
npx wrangler secret put JWT_SECRET --env production
npx wrangler secret put JWT_REFRESH_SECRET --env production
```

### Verifying Secrets Are Set

```bash
# Lists secret names (values are never exposed)
npx wrangler secret list --env production
npx wrangler secret list --env staging
```

### KV Namespace Reference

These are configured in `wrangler.jsonc` and created via the Cloudflare dashboard or CLI.

| Binding | Production ID | Staging ID | Purpose |
|---------|--------------|------------|---------|
| `DEALS_PROD` | `23ee9b8c9e2748e5880f476b8b57a524` | `b0db85b92fae45c1895152737ab72649` | Deal snapshots |
| `DEALS_STAGING` | `b0db85b92fae45c1895152737ab72649` | `b0db85b92fae45c1895152737ab72649` | Staging data |
| `DEALS_LOG` | `1f1a901fd6fb4dffbdcc86aa4a914ba8` | `1f1a901fd6fb4dffbdcc86aa4a914ba8-staging` | Pipeline logs |
| `DEALS_LOCK` | `e3ab520eafd5430ab72978e78bdd257e` | `e3ab520eafd5430ab72978e78bdd257e` | Concurrency locks |
| `DEALS_SOURCES` | `be3c0fc148b749b49a59aa7cfa23e3ac` | `be3c0fc148b749b49a59aa7cfa23e3ac` | Source registry & API keys |

---

## 4. GitHub Actions Setup

### Required Repository Secrets

Go to GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

| Secret Name | Value | Notes |
|-------------|-------|-------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions | Token must have `Workers Scripts:Edit` and `KV Storage:Edit`, and `Vectorize:Edit` for semantic search |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID. Required: used by `wrangler deploy` and the API rollback path. | Found in dashboard right sidebar |

### Required Repository Variables

Go to GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**.

| Variable Name | Value | Notes |
|---------------|-------|-------|
| `WORKER_HOST` | **Required** — the workers.dev hostname (or custom domain). The Cloudflare workers.dev URL pattern is `<worker-name>.<account-subdomain>.workers.dev`; the `account-subdomain` is a slug chosen at account creation (e.g. `do-it-119`) and **cannot be derived from `CLOUDFLARE_ACCOUNT_ID`**. This is stored as a *variable* (not a secret) because the workers.dev hostname is not sensitive. | e.g., `do-deal-relay.do-it-119.workers.dev`, or `deals.example.com` for a custom domain |

### How Worker URLs Are Resolved

All CI workflows resolve the worker URL via `scripts/worker-host.sh <env>`. This script requires the `WORKER_HOST` variable (or env var) to be set and returns exit code 2 otherwise. The `account_id` (a hex hash) is **not** usable to derive the workers.dev hostname.

Resolution order in `scripts/worker-host.sh`:

1. `$WORKER_HOST` (primary; set via `${{ vars.WORKER_HOST }}` in CI)
2. `$CLOUDFLARE_WORKER_HOST` (legacy alias, still accepted for backward compatibility)
3. `$WORKER_HOST_OVERRIDE` (ad-hoc override for testing)
4. Else: exit 2 with an actionable error pointing the operator to set the variable.

```bash
$ WORKER_HOST=do-deal-relay.do-it-119.workers.dev \
    scripts/worker-host.sh production
do-deal-relay.do-it-119.workers.dev

$ WORKER_HOST=deals.example.com scripts/worker-host.sh production
deals.example.com
```

### Required GitHub Environments

The deploy workflows reference GitHub Environments for deployment protection:

1. Go to **Settings** → **Environments**
2. Create `staging` environment (no protection rules needed)
3. Create `production` environment with:
   - **Required reviewers**: Add at least 1 maintainer
   - **Wait timer**: Optional (e.g., 5 minutes for manual approval)
   - **Deployment branches**: Restrict to `main` and tags matching `v*`

### Verifying CI/CD Setup

Push a commit to `develop` to trigger the staging deploy workflow. Check the **Actions** tab for the `Deploy - Staging` workflow run.

---

## 5. Deployment Process

### Flow Overview

```
develop branch → Staging deploy → Verify → Merge to main → Production deploy → Verify
     ↑                                                                    ↑
  Auto-triggered                                                  Auto-triggered (or tag)
```

### 5.1 Deploy to Staging

**Automatic**: Push to `develop` branch triggers `.github/workflows/deploy-staging.yml`.

**Manual trigger**:

```bash
# Via wrangler CLI
npx wrangler deploy --env staging

# Via GitHub Actions (workflow_dispatch)
# Go to Actions → Deploy - Staging → Run workflow → select "staging"
```

**What it does**:
1. Installs dependencies (`npm ci`)
2. Type checks (`npx tsc --noEmit`)
3. Runs test suite (`./scripts/run-tests-ci.sh`)
4. Deploys via `wrangler deploy --env staging`
5. Health check with retries (5 attempts, 10s apart)
6. Smoke tests: `/health`, `/metrics`, `/deals`, `/api/status`

### 5.2 Deploy to Production

**Automatic**: Push to `main` branch or `v*` tag triggers `.github/workflows/deploy-production.yml`.

**Manual trigger** (requires confirmation):

```bash
# Via wrangler CLI
npx wrangler deploy --env production

# Via GitHub Actions
# Go to Actions → Deploy - Production → Run workflow → check "Confirm production deployment"
```

**What it does**:
1. Pre-deploy checks: full test suite, quality gate, staging health verification
2. Builds the project (`npm run build`)
3. Deploys via `wrangler deploy --env production`
4. Health check with retries
5. Seeds KV if fresh deployment detected (health returns 503)
6. Seeds E2E test API keys to production KV
7. Smoke tests on production endpoints
8. Triggers initial discovery pipeline (`POST /api/discover`)
9. Creates deployment summary in GitHub Actions
10. Creates GitHub release if triggered by a `v*` tag

### 5.3 Tagged Release (Recommended for Production)

```bash
# Create and push a version tag
git tag v1.2.3
git push origin v1.2.3
```

This triggers production deployment AND creates a GitHub Release automatically.

### 5.4 Local Development Deploy

```bash
# Start local dev server
npm run dev

# The dev server runs at http://localhost:8787
# Required env vars are read from .dev.vars (gitignored)
# Minimum required for local dev:
echo 'WEBHOOK_SECRET=dev_secret' > .dev.vars
echo 'API_ENCRYPTION_KEY=dev_encryption_key_32_chars_long!!' >> .dev.vars
echo 'EMAIL_WEBHOOK_SECRET=dev_email_secret' >> .dev.vars
```

---

## 6. Verification

### Post-Deployment Health Checks

After every deployment, verify these endpoints:

```bash
# Set your worker URL
STAGING_URL="https://do-deal-relay-staging.<ACCOUNT_ID>.workers.dev"
PROD_URL="https://do-deal-relay.<ACCOUNT_ID>.workers.dev"

# 1. Health check (must return 200 with "healthy" status)
curl -sf "${PROD_URL}/health" | jq .

# 2. Readiness check
curl -sf "${PROD_URL}/health/ready" | jq .

# 3. Liveness check
curl -sf "${PROD_URL}/health/live" | jq .

# 4. Metrics endpoint (Prometheus-compatible JSON)
curl -sf "${PROD_URL}/metrics" | jq .

# 5. Deals endpoint
curl -sf "${PROD_URL}/deals" | jq .

# 6. API status
curl -sf "${PROD_URL}/api/status" | jq .

# 7. Trigger manual discovery (POST)
curl -sf -X POST "${PROD_URL}/api/discover" | jq .
```

### Automated Verification

The deploy workflows run these checks automatically. If any fail, the workflow fails and a GitHub issue is created.

### Cron Trigger Verification

```bash
# List registered cron triggers
npx wrangler triggers list --env production
```

Expected cron schedules:
- `0 */6 * * *` — Discovery pipeline (every 6 hours)
- `0 9 * * *` — Expiry check (daily at 9am)
- `0 0 * * SUN` — Full validation sweep (weekly, Sunday midnight)

### Smoke Test Script

```bash
# Run the full verification script
./scripts/verify-deployment.sh <subdomain> production
```

---

## 7. Rollback Procedures

### 7.1 Automated Rollback (CI/CD)

When a production deployment fails, the `rollback-on-failure` job in `deploy-production.yml` automatically attempts:

1. `wrangler rollback --env production` (rolls back to previous worker version)
2. Falls back to Cloudflare API rollback if wrangler fails
3. Verifies health after rollback

### 7.2 Manual Rollback via GitHub Actions

Use the dedicated rollback workflow for controlled rollbacks:

1. Go to **Actions** → **Rollback Production**
2. Click **Run workflow**
3. Enter the **version** to rollback to:
   - Tag format: `v1.2.3`
   - Commit SHA format: `abc1234`
4. Enter a **reason** for the rollback
5. Click **Run workflow**

The workflow will:
- Checkout the target version
- Build and deploy it
- Verify health
- Create a rollback issue for tracking

### 7.3 Manual Rollback via Wrangler CLI

```bash
# Roll back to the previous deployed version
npx wrangler rollback --env production

# Roll back to a specific version (by uploading that version's code)
git checkout v1.2.3   # or a commit SHA
npm ci
npm run build
npx wrangler deploy --env production
```

### 7.4 Emergency Rollback (Nuclear Option)

If the worker is completely broken and automated rollback fails:

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → `do-deal-relay`
2. Go to **Settings** → **Domains & Routes**
3. Remove the production route/domain temporarily (stops traffic)
4. Or: **Delete the worker** and redeploy from last known good commit

### 7.5 Post-Rollback Checklist

After any rollback:

- [ ] Verify `/health` returns 200 with `"status": "healthy"`
- [ ] Test critical endpoints (`/deals`, `/api/status`)
- [ ] Check `npx wrangler tail` for error logs
- [ ] Verify cron triggers are still registered (`npx wrangler triggers list`)
- [ ] Confirm KV data integrity (`npx wrangler kv key list --namespace-id <id>`)
- [ ] Create a post-mortem issue if the failure was unexpected

---

## 8. Troubleshooting

### Worker Won't Start (503 Configuration Error)

**Symptom**: `/health` returns `{"error": "Configuration error", "message": "Missing required config: ..."}`

**Cause**: Required secret or binding is missing.

**Fix**:
```bash
# Check which config is missing from the error message
# Required bindings: DEALS_PROD, DEALS_LOG, DEALS_LOCK, AI_GATEWAY_URL,
#                    TRUST_THRESHOLD, WEBHOOK_SECRET, EMAIL_WEBHOOK_SECRET,
#                    API_ENCRYPTION_KEY, DEALS_DB, ENVIRONMENT, GITHUB_REPO

# List all secrets
npx wrangler secret list --env production

# Re-set any missing secrets
npx wrangler secret put WEBHOOK_SECRET --env production
npx wrangler secret put API_ENCRYPTION_KEY --env production
npx wrangler secret put EMAIL_WEBHOOK_SECRET --env production
```

### Health Returns 503 After Fresh Deploy

**Symptom**: First deploy returns 503 on `/health`.

**Cause**: KV snapshot hasn't been initialized yet.

**Fix**:
```bash
# Trigger discovery to seed KV
curl -sf -X POST "https://do-deal-relay.<ACCOUNT_ID>.workers.dev/api/discover"

# Wait 10 seconds, then check health again
sleep 10
curl -sf "https://do-deal-relay.<ACCOUNT_ID>.workers.dev/health"
```

### Cron Jobs Not Firing

**Symptom**: No discovery runs for >6 hours.

**Fix**:
```bash
# 1. Verify triggers are registered
npx wrangler triggers list --env production

# 2. If missing, redeploy to re-register
npx wrangler deploy --env production

# 3. Manually trigger as workaround
curl -sf -X POST "https://do-deal-relay.<ACCOUNT_ID>.workers.dev/api/discover"
```

### KV Operations Failing

**Symptom**: Health shows degraded, errors in logs.

**Fix**:
```bash
# Check KV namespace bindings match the dashboard
npx wrangler kv namespace list

# List keys in a namespace to verify connectivity
npx wrangler kv key list --namespace-id be3c0fc148b749b49a59aa7cfa23e3ac

# If namespace IDs mismatch, update wrangler.jsonc and redeploy
```

### CI Deployment Fails with Secret Errors

**Symptom**: GitHub Actions deploy step fails.

**Fix**:
1. Verify `CLOUDFLARE_API_TOKEN` has correct permissions (Workers Scripts:Edit, KV Storage:Edit)
2. Verify `CLOUDFLARE_ACCOUNT_ID` matches the account
3. Check if the API token has expired
4. Regenerate at: Cloudflare dashboard → My Profile → API Tokens

### CI Fails at "Verify staging is healthy" with `❌ WORKER_HOST is not set`

**Symptom**: `❌ WORKER_HOST is not set` or `❌ Staging not healthy` early in the deploy job.

**Cause**: The `WORKER_HOST` repo variable is unset.

**Fix**:
1. Confirm `WORKER_HOST` is set in repo **Settings → Secrets and variables → Actions → Variables** (not Secrets — the workers.dev hostname is not sensitive).
2. Confirm `CLOUDFLARE_ACCOUNT_ID` secret is set (needed for the API rollback path).
3. Confirm the latest commit on the running branch contains `scripts/worker-host.sh`.
4. If using a custom domain, set `WORKER_HOST=deals.example.com`.

Legacy alias `CLOUDFLARE_WORKER_HOST` is still accepted by `scripts/worker-host.sh` for backward compatibility, but the canonical name going forward is `WORKER_HOST`.

### Type Errors After Merge

**Symptom**: CI fails with TypeScript errors.

**Fix**:
```bash
# Check out latest main
git fetch origin main
git rebase origin/main

# Fix type errors
npx tsc --noEmit

# Run full validation
./scripts/quality_gate.sh

# Commit fixes and push
```

### Deployment Stuck / Timeout

**Symptom**: Deploy workflow hangs for >15 minutes.

**Fix**:
1. Check GitHub Actions logs for the specific step
2. If wrangler deploy hangs, cancel and retry
3. Check Cloudflare status page: https://www.cloudflarestatus.com
4. Verify no concurrent deploys are running (check the `deploy-staging` or `deploy-production` concurrency group)

### Worker Logs Not Appearing

**Symptom**: `npx wrangler tail` shows no output.

**Fix**:
```bash
# Ensure observability is enabled in wrangler.jsonc
# "observability": { "logs": { "enabled": true } }

# Try with explicit env
npx wrangler tail --env production

# Check Cloudflare dashboard → Workers → do-deal-relay → Logs
```

---

## Appendix: Environment URLs

| Environment | URL Pattern |
|-------------|-------------|
| Staging | `https://do-deal-relay-staging.<ACCOUNT_ID>.workers.dev` |
| Production | `https://do-deal-relay.<ACCOUNT_ID>.workers.dev` |
| Custom Domain | Set via Cloudflare dashboard → Workers → Custom Domains |

## Appendix: Quick Command Reference

```bash
# Deploy
npx wrangler deploy --env staging       # Deploy to staging
npx wrangler deploy --env production    # Deploy to production

# Secrets
npx wrangler secret list --env production       # List secrets
npx wrangler secret put <NAME> --env production # Set a secret
npx wrangler secret delete <NAME> --env production # Delete a secret

# KV
npx wrangler kv key list --namespace-id <ID>         # List keys
npx wrangler kv key get --namespace-id <ID> <KEY>    # Get a key
npx wrangler kv key put --namespace-id <ID> <KEY> <VALUE> # Set a key

# Monitoring
npx wrangler tail --env production    # Stream live logs
npx wrangler triggers list --env production  # List cron triggers

# Rollback
npx wrangler rollback --env production  # Rollback to previous version

# Verification
curl -sf https://do-deal-relay.<ACCOUNT_ID>.workers.dev/health | jq .
./scripts/verify-deployment.sh <subdomain> production
```
