# Follow-Up: E2E Tests Fail Locally Due to Missing Environment Variables

**Date**: 2026-06-04
**Status**: Open
**Severity**: Medium (blocks local E2E verification, CI works fine)

## Issue

E2E tests (`npx playwright test tests/e2e/`) fail locally because the required environment variables are not set:

- `WEBHOOK_SECRET`
- `EMAIL_WEBHOOK_SECRET`
- `API_ENCRYPTION_KEY`

The error originates from `worker/lib/config-utils.ts` via `validateConfig()`, which was updated in a prior PR to require `EMAIL_WEBHOOK_SECRET`. The CI workflow (`ci.yml`) passes these vars to `wrangler dev`, but local development has no equivalent setup.

## Root Cause

When `EMAIL_WEBHOOK_SECRET` was added to `validateConfig()`, the CI workflows were updated (per LEARNINGS.md 2026-06-03), but no local `.dev.vars.example` or documentation was created to guide developers running E2E tests locally.

## Proposed Resolution

1. **Verify `.dev.vars.example`** includes all three required variables with placeholder values.
2. **Update `docs/QUICKSTART.md`** or `CONTRIBUTING.md` with instructions for setting up local env vars before running E2E tests.
3. **Add a pre-flight check** to the Playwright config or a setup script that validates env vars are present before attempting to start the web server, with a clear error message pointing to `.dev.vars.example`.

## Related

- LEARNINGS.md entry: 2026-06-03 (E2E + Smoke Tests failed in CI)
- Guardrail: `agents-docs/accuracy-guardrails.md` — Config Contract Changes
