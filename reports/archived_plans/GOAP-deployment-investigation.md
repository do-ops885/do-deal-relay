# GOAP: Deployment Pipeline Investigation

## Date: 2026-06-03
## Issues: #328-#387 (29 open rollback issues)
## Severity: Critical - Production deployments blocked since 2026-05-20

---

## Executive Summary

Production deployments have been failing since May 20, 2026 due to a staging health check gate introduced in PR #330. The root cause is missing Cloudflare Worker secrets (`EMAIL_WEBHOOK_SECRET`, `API_ENCRYPTION_KEY`) that are now required by startup validation but were never configured in the Cloudflare environments.

---

## Root Cause Analysis

### Primary Issue: Missing Secrets in Cloudflare Environments

**Commit**: `4f59dff` - "Implement Startup Environment Variable Validation (#330)"
**Date**: May 20, 2026

PR #330 added fail-fast startup validation in `worker/lib/config-utils.ts:29-72` that requires:
- `WEBHOOK_SECRET`
- `EMAIL_WEBHOOK_SECRET`
- `API_ENCRYPTION_KEY`
- `DEALS_DB`
- Plus existing requirements

When these secrets are missing, the worker returns **503 Service Unavailable** on ALL requests, including `/health`.

### Failure Chain

```
1. Staging deployment missing secrets → Worker returns 503 on /health
2. Production workflow "Verify staging is healthy" gate → curl -sf fails on 503
3. Production deployment blocked → workflow fails
4. Automated rollback triggered → fails with auth error (code: 9106)
5. Rollback issue created → 29 issues accumulated (#332-#400)
```

### Secondary Issue: Rollback Authentication Failure

The automated rollback in `deploy-production.yml:370-429` fails with:
```
Authentication failed (status: 400) [code: 9106]
```

This indicates `CLOUDFLARE_API_TOKEN` either:
- Lacks `Workers Scripts: Edit` permission
- Has expired
- Is not properly scoped for the account

---

## Evidence

### 1. Failed Deployment Logs
Both recent failures (runs 26892026480, 26891131432) show:
```
❌ Staging not healthy. Aborting production deployment.
```

### 2. Rollback Issues
29 open issues (#332-#400) all with title:
```
ROLLBACK REQUIRED - Production deployment failed
```

### 3. Code Validation Requirements
`worker/lib/config-utils.ts:30-42`:
```typescript
const required = [
  "DEALS_PROD", "DEALS_LOG", "DEALS_LOCK", "AI_GATEWAY_URL",
  "TRUST_THRESHOLD", "WEBHOOK_SECRET", "EMAIL_WEBHOOK_SECRET",
  "API_ENCRYPTION_KEY", "DEALS_DB", "ENVIRONMENT", "GITHUB_REPO",
];
```

### 4. Staging Workflow Uses Same Secrets
`deploy-staging.yml` uses `${{ secrets.CLOUDFLARE_API_TOKEN }}` and `${{ secrets.CLOUDFLARE_ACCOUNT_ID }}` but doesn't configure the new required secrets on the Worker itself.

---

## Fix Options

### Option A: Configure Secrets in Cloudflare (Recommended)
**Time**: 10 minutes | **Risk**: Low

1. Set secrets via Wrangler CLI:
```bash
# For staging
echo "your-webhook-secret" | npx wrangler secret put WEBHOOK_SECRET --env staging
echo "your-email-secret" | npx wrangler secret put EMAIL_WEBHOOK_SECRET --env staging
echo "your-encryption-key" | npx wrangler secret put API_ENCRYPTION_KEY --env staging

# For production
echo "your-webhook-secret" | npx wrangler secret put WEBHOOK_SECRET --env production
echo "your-email-secret" | npx wrangler secret put EMAIL_WEBHOOK_SECRET --env production
echo "your-encryption-key" | npx wrangler secret put API_ENCRYPTION_KEY --env production
```

1. Verify secrets are set:
```bash
npx wrangler secret list --env staging
npx wrangler secret list --env production
```

1. Fix API token permissions:
   - Go to Cloudflare Dashboard → My Profile → API Tokens
   - Edit the token used for deployments
   - Ensure it has: `Workers Scripts: Edit` permission
   - If expired, generate a new token

### Option B: Make Secrets Optional for Health Checks
**Time**: 30 minutes | **Risk**: Medium

Modify the health endpoint to bypass config validation:

```typescript
// worker/routes/health.ts
export async function handleHealth(env: Env, request?: Request): Promise<Response> {
  // Bypass config validation for health checks
  // ... existing health check logic
}
```

### Option C: Relax Validation Requirements
**Time**: 15 minutes | **Risk**: High

Remove `EMAIL_WEBHOOK_SECRET` from required list if email features are optional:

```typescript
// worker/lib/config-utils.ts
const required = [
  // ... remove EMAIL_WEBHOOK_SECRET
];
```

---

## Recommended Action Plan

### Immediate (Today)
1. **Configure secrets in Cloudflare** using Option A
2. **Regenerate API token** if it has expired
3. **Test staging health** after secret configuration
4. **Close all 29 rollback issues** with explanation

### Short-term (This Week)
1. Add secret validation check to CI/CD pipeline
2. Add documentation for required secrets in `.dev.vars.example`
3. Consider adding a "secrets configured" check to deployment workflow

### Long-term (Next Sprint)
1. Implement secret rotation strategy
2. Add monitoring for secret expiration
3. Consider using Cloudflare Secrets Store for better management

---

## Lessons Learned

| Lesson | Action |
|--------|--------|
| Adding required secrets requires environment updates | Create a checklist for new required secrets |
| Health check gates can block all deployments | Consider making health checks more resilient |
| Automated rollback requires proper API permissions | Validate API token permissions before deploying |
| Rollback issues accumulate without cleanup | Add issue lifecycle management |

---

## Related Issues

- #330: PR that introduced the breaking change
- #332-#400: All rollback issues caused by this
- #320: Deploy workflow hardening (may have introduced the staging gate)

---

## Status

- [ ] Secrets configured in staging
- [ ] Secrets configured in production
- [ ] API token permissions verified
- [ ] Staging health check passing
- [ ] Production deployment successful
- [ ] Rollback issues closed
