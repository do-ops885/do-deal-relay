# ADR-018: Workers Builds Cloudflare Dashboard Integration Failure

**Status**: Accepted (triage)
**Created**: 2026-07-07
**Type**: External Dependency Failure

---

## Context

The `Workers Builds: do-deal-relay` check fails on every push to `main`. This is a **Cloudflare dashboard auto-deployment integration** — a separate build system from GitHub Actions, configured in the Cloudflare dashboard (not in the repo).

The check links to:
`https://dash.cloudflare.com/.../workers/services/view/do-deal-relay/production/builds/...`

## Root Cause

The Cloudflare Workers Builds integration is configured in the Cloudflare dashboard to auto-deploy on push. It fails because:

1. The integration runs its own build pipeline independent of GitHub Actions
2. It may lack access to repository secrets or use a different build configuration
3. The repo already has a GitHub Actions deploy workflow (`.github/workflows/deploy-production.yml`) that handles production deployments via `cloudflare/wrangler-action`

The two systems conflict: GitHub Actions deploys via wrangler, while Cloudflare Workers Builds runs a separate pipeline.

## Decision

**Accept the failure as out-of-scope.** The Cloudflare dashboard integration is not managed via code. The GitHub Actions deploy workflow is the canonical deployment path.

### Resolution Options (require human action)

1. **Disable Workers Builds** in the Cloudflare dashboard (recommended if GitHub Actions deploy is canonical)
2. **Configure Workers Builds** to match the GitHub Actions deploy config
3. **Remove the Cloudflare dashboard integration** entirely

## Impact

- CI shows `UNSTABLE` merge state due to this external check
- All GitHub Actions checks pass (37/37)
- Deployments work correctly via GitHub Actions
