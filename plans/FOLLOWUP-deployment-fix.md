# Follow-up: Deployment Workflow Fix

**Status**: ✅ Resolved (see plan `FIX-issue-423-worker-host.md`)

## Issue
Production deployment fails because staging health check fails.

## Root Cause
The workflow read `WORKER_HOST="${{ secrets.CLOUDFLARE_WORKER_HOST }}"`, but the `CLOUDFLARE_WORKER_HOST` secret was **not set in the GitHub repository**. The variable expanded to an empty string, producing an invalid URL (`https:///health`) which failed the curl health check, which in turn blocked the production deploy, which triggered rollback, which also failed (wrangler 4.79.0 auth bug).

## Resolution

Introduced `scripts/worker-host.sh` which derives the worker hostname from
`CLOUDFLARE_ACCOUNT_ID` and the worker name in `wrangler.jsonc`. The
`CLOUDFLARE_WORKER_HOST` secret is now an **optional override** for custom
domains — no longer required for default `*.workers.dev` URLs.

Workflows updated: `deploy-production.yml`, `discovery.yml`, `canary.yml`.

## Error Message (before fix)
```
❌ CLOUDFLARE_WORKER_HOST secret not set
❌ Staging not healthy. Aborting production deployment.
```

## Remaining Investigation (out of scope of #423)

1. **Check if staging worker exists**:
   ```bash
   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<id> \
     npx wrangler workers list --env staging
   ```

2. **Check staging worker health**:
   ```bash
   curl -sf https://do-deal-relay-staging.<ACCOUNT_ID>.workers.dev/health
   ```

3. **Check Cloudflare dashboard**:
   - Navigate to Workers & Pages
   - Verify `do-deal-relay-staging` exists and is active
   - Check deployment logs for errors

## Possible Fixes

### Option 1: Deploy Staging Worker
If staging doesn't exist or is outdated:
```bash
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<id> \
  npx wrangler deploy --env staging
```

### Option 2: Fix Secrets
If secrets are misconfigured:
- Verify `CLOUDFLARE_ACCOUNT_ID` is correct
- Verify `CLOUDFLARE_API_TOKEN` has sufficient permissions
- Verify `CLOUDFLARE_WORKER_HOST` points to correct staging URL

### Option 3: Skip Health Check (Temporary)
If staging is intentionally not deployed, modify the workflow to skip the check:

```yaml
- name: Verify staging is healthy
  if: github.ref == 'refs/heads/main' && false  # Disabled
  run: ...
```

### Option 4: Make Health Check Non-blocking
Change the health check to warn instead of fail:

```yaml
- name: Verify staging is healthy
  if: github.ref == 'refs/heads/main'
  run: |
    if ! curl -sf "${STAGING_URL}"; then
      echo "⚠️  Staging not healthy, but continuing deployment"
      exit 0  # Changed from exit 1
    fi
```

## Recommendation

**Option 3 or 4** for immediate unblocking, then investigate and fix the staging deployment properly.

## Priority
P0 - Blocking production deployments

## Assigned
DevOps/Infrastructure team
