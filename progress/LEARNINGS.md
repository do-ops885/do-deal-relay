# LEARNINGS - do-deal-relay

> Every correction becomes a rule.

| Date | Severity | Issue | Root Cause | Prevention |
|------|----------|-------|-----------|------------|
| 2026-06-03 | 🔴 High | E2E + Smoke Tests failed in CI (missing `EMAIL_WEBHOOK_SECRET`) | `validateConfig()` requires `EMAIL_WEBHOOK_SECRET` but CI workflow only passed `WEBHOOK_SECRET` and `API_ENCRYPTION_KEY` to `wrangler dev` | When adding a new required env var to `validateConfig()`, update ALL CI workflows that start `wrangler dev` (ci.yml E2E/Smoke jobs, deploy-staging.yml, deploy-production.yml) |
| 2026-06-03 | 🟡 Medium | E2E metrics test expected Prometheus format, got JSON | Main changed `/metrics` to return JSON by default, E2E tests still expected `text/plain` with `# HELP` | After endpoint behavior changes, update ALL test files (unit, integration, E2E, smoke) that assert on response format |
| 2026-05-20 | 🔴 High | PR #324 merge conflicts (6 files) | PR branch and `main` both modified same security/auth files in parallel (`worker/config.ts`, `worker/lib/security.ts`, `worker/lib/research-agent/fetcher.ts`, `worker/routes/referrals.ts`, `worker/index.ts`) | Use the Shared Files Protocol; check active branches before modifying security infrastructure files |
| 2026-05-20 | 🔴 High | Post-merge TS errors (test imports of deleted modules, wrong function arity) | Main branch deleted `worker/pipeline/discovery-utils.ts` that PR branch's tests still imported; main added `request` param to `handleGetReferralByCode` | Run `npm run typecheck` and full test suite immediately after merge resolution |

As new lessons are discovered, add them to this table. Keep the table sorted by most recent date first.
