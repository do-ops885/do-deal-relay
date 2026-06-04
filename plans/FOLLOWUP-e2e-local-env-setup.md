# Follow-Up: E2E Tests Fail Locally Due to Missing Environment Variables

**Date**: 2026-06-04
**Status**: In Progress
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
- ⚠️ 7 of 26 E2E tests still fail with 401 Unauthorized (deals endpoints require auth tokens not provided in test setup)
- ✅ 19 of 26 E2E tests now pass

## Remaining: Auth Token in E2E Tests

The 7 failing tests all hit `/deals` endpoints that require JWT authentication. The E2E test setup needs to obtain a valid auth token before calling these endpoints. This is a pre-existing issue unrelated to our Codacy fixes.

## Proposed Resolution

1. **Document `.dev.vars` setup** — Add instructions to `CONTRIBUTING.md` or `docs/QUICKSTART.md` to copy `.dev.vars.example` to `.dev.vars` before running E2E tests.
2. **Fix E2E auth setup** — Add a global setup step in `playwright.config.ts` or `tests/e2e/` that registers a test user and obtains a JWT token, then passes it to deal-related tests.
3. **Add a pre-flight check** to the Playwright config that validates env vars are present before attempting to start the web server, with a clear error message pointing to `.dev.vars.example`.

## Related

- LEARNINGS.md entry: 2026-06-03 (E2E + Smoke Tests failed in CI)
- Guardrail: `agents-docs/accuracy-guardrails.md` — Config Contract Changes
