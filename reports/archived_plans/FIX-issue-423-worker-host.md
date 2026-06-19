# Plan: Fix WORKER_HOST Resolution in CI/CD

**Issue**: [#423](https://github.com/do-ops885/do-deal-relay/issues/423) — Production deployment failed at `Verify staging is healthy` step.

**Root cause**: The workflow reads `WORKER_HOST="${{ secrets.CLOUDFLARE_WORKER_HOST }}"`, but the `CLOUDFLARE_WORKER_HOST` secret is not set in the GitHub repository. The variable expands to an empty string, producing an invalid URL (`https:///health`) which fails the curl health check, which in turn blocks the production deploy, which triggers rollback, which also fails (wrangler 4.79.0 auth bug).

**Strategy**: Replace brittle `WORKER_HOST` secret dependency with a deterministic URL derived from `CLOUDFLARE_ACCOUNT_ID` and the worker name already configured in `wrangler.jsonc` (`do-deal-relay` for prod, `do-deal-relay-staging` for staging). Keep `CLOUDFLARE_WORKER_HOST` as an **optional override** for custom domains.

## Affected Files

| File | Why |
|------|-----|
| `.github/workflows/deploy-production.yml` | Primary failure site: `Verify staging is healthy` |
| `.github/workflows/discovery.yml` | Same pattern, blocks scheduled discovery |
| `.github/workflows/canary.yml` | Same pattern, blocks canary |
| `scripts/worker-host.sh` | **New** — shared URL-resolution helper (DRY) |
| `docs/deployment-runbook.md` | Document new pattern + override behavior |

## Atomic Tasks

1. **Create `scripts/worker-host.sh`** — Bash helper that prints `https://${WORKER_NAME}.${CLOUDFLARE_ACCOUNT_ID}.workers.dev` (or `https://${CLOUDFLARE_WORKER_HOST}` if override is set). Validates required inputs.
2. **Refactor `deploy-production.yml`** — Replace inline `WORKER_HOST` resolution with helper call. Apply to: `Verify staging is healthy`, `Verify production deployment`, `Seed KV`, `Smoke tests`, `Trigger initial discovery`, `Deployment summary`, `Rollback` step.
3. **Refactor `discovery.yml`** — Same helper in both `discovery-production` and `discovery-staging` jobs.
4. **Refactor `canary.yml`** — Same helper in `deploy-canary` and `monitor-canary` jobs.
5. **Update `docs/deployment-runbook.md`** — Mark `CLOUDFLARE_WORKER_HOST` as optional override; document derived default.
6. **Run `./scripts/quality_gate.sh`** — Verify nothing broken.
7. **Commit via `./scripts/ai-commit.sh`**.

## Resolution Pattern

```bash
# Default: derived from account ID + worker name from wrangler.jsonc
#   PROD_URL     = https://do-deal-relay.${ACCOUNT_ID}.workers.dev
#   STAGING_URL  = https://do-deal-relay-staging.${ACCOUNT_ID}.workers.dev
#
# Override: when CLOUDFLARE_WORKER_HOST is set (custom domain)
#   PROD_URL     = https://${CLOUDFLARE_WORKER_HOST}
#   STAGING_URL  = https://${CLOUDFLARE_WORKER_HOST}

WORKER_HOST=$(scripts/worker-host.sh <env> "${CLOUDFLARE_WORKER_HOST:-}" "${CLOUDFLARE_ACCOUNT_ID}")
# Returns just the host (no scheme) for backward compatibility
```

## Non-Goals

- Do **not** add a `deploy-staging.yml` workflow (out of scope).
- Do **not** change the wrangler version in the rollback job (separate concern; tracked elsewhere).
- Do **not** modify production/staging env names in `wrangler.jsonc`.

## Verification

- `bash -n scripts/worker-host.sh` — syntax check
- `shellcheck scripts/worker-host.sh` — lint
- `./scripts/quality_gate.sh` — full validation
- Manually invoke `scripts/worker-host.sh production` to confirm output

## Rollback Plan

If the fix breaks CI, revert the commit (no production state changes). The change is purely workflow plumbing.
