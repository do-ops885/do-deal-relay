# ADR-019: Deploy Workflow Timeout Too Low

**Status**: Accepted (blocked)
**Created**: 2026-07-07
**Type**: CI Infrastructure

---

## Context

The `Deploy - Production` workflow's `Pre-Deploy Validation` job has a 15-minute timeout. The job runs:
1. `npm ci` (~30s)
2. `npm run test:ci` (full test suite, ~11 min)
3. `./scripts/quality_gate.sh` (~1 min)
4. Verify staging health (optional, ~10s)

Total: ~12.5 min — dangerously close to the 15-min limit. On slower runners or with cache misses, it exceeds the limit and gets cancelled.

## Root Cause

The timeout was set before the test suite grew to its current size. Unit tests alone take ~11 minutes.

## Fix

Increase `timeout-minutes` from 15 to 30 for `pre-deploy-checks` and from 15 to 20 for `deploy-production`.

**File**: `.github/workflows/deploy-production.yml`

```yaml
# Before
pre-deploy-checks:
  timeout-minutes: 15
deploy-production:
  timeout-minutes: 15

# After
pre-deploy-checks:
  timeout-minutes: 30
deploy-production:
  timeout-minutes: 20
```

## Blocker

The OAuth token used by the agent lacks `workflow` scope, preventing direct pushes to `.github/workflows/` files. A human must apply this change manually or grant the token `workflow` scope.

## Impact

- Deploy workflow cancelled on every push to `main`
- All other CI checks pass
- Deployments via `wrangler deploy` work when triggered manually
