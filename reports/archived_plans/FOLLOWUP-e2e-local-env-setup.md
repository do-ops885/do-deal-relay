# Follow-Up: E2E Tests Fail Locally Due to Missing Environment Variables

**Date**: 2026-06-04
**Status**: Resolved
**Severity**: Medium (blocks full local E2E verification, CI works fine)

## Issue

E2E tests (`npx playwright test tests/e2e/`) fail locally because the required environment variables are not set:

- `WEBHOOK_SECRET`
- `EMAIL_WEBHOOK_SECRET`
- `API_ENCRYPTION_KEY`

The error originates from `worker/lib/config-utils.ts` via `validateConfig()`, which was updated in a prior PR to require `EMAIL_WEBHOOK_SECRET`. The CI workflow (`ci.yml`) passes these vars to `wrangler dev`, but local development has no equivalent setup.

## Progress

- ✅ `.dev.vars.example` already includes all three required variables with placeholder values
- ✅ Copying `.dev.vars.example` → `.dev.vars` resolves the `validateConfig()` error
- ✅ E2E auth setup implemented: `global-setup.ts` seeds KV with test API keys and obtains JWT token
- ✅ `generate-jwt.mjs` creates deterministic JWT tokens for local testing
- ✅ `setup-auth.sh` provides fallback auth setup
- ✅ 19+ of 26 E2E tests now pass with proper auth

## Resolution

E2E auth setup has been implemented via:
1. `tests/e2e/global-setup.ts` - Seeds KV with test API keys and obtains JWT token
2. `tests/e2e/generate-jwt.mjs` - Creates deterministic JWT tokens for local testing
3. `tests/e2e/setup-auth.sh` - Fallback auth setup script
4. `playwright.config.ts` - Validates required env vars before starting tests

The remaining test failures are due to test-specific requirements, not auth setup.

## Related

- LEARNINGS.md entry: 2026-06-03 (E2E + Smoke Tests failed in CI)
- Guardrail: `agents-docs/accuracy-guardrails.md` — Config Contract Changes
