# PEV Spec — CI Unblock + Full Hygiene (2026-09-07)

## Task

**Title**: Unblock origin/main CI (npm ERESOLVE) and address pre-existing warnings
**Author**: opencode
**Date**: 2026-09-07
**Priority**: high

## Goal

Restore green CI on main by resolving the vitest 5 / pool-workers peer conflict and zod 4 major risk, plus full-hygiene fixes for webhook hermeticity, CI status scripts, and dependabot major policy.

## Approach

Pin vitest/coverage to v4 and zod to v3, restore webhook validateFetchUrl mocks, harden CI status scripts to query main branch across all workflows, and ignore major bumps until dedicated migration specs land.

## Non-Goals

- [ ] Not migrating to zod v4 (separate spec required for 21 files, record + error.errors breakage)
- [ ] Not upgrading to vitest 5 until @cloudflare/vitest-pool-workers ships v5 support (latest still 0.22.0)
- [ ] Not splitting worker/lib/rate-limit.ts (496/500 passes; split is follow-up if growth resumes)
- [ ] Not changing endpoint limits, 429 shape, or wrangler namespace_ids (deploy-owned)
- [ ] Not touching opencode.json local provider config (stashed, out of scope)

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Pin vitest/coverage ^5.0.0 to ^4.1.11, zod ^4.5.4 to ^3.22.4, regen lock | package.json, package-lock.json | low |
| 2 | Restore webhook validateFetchUrl hermetic mocks deleted by beac13e | tests/unit/webhook/routes-handlers.test.ts, ssrf-protection.test.ts | low |
| 3 | Harden check-ci-status.sh live check (main branch, all workflows, larger window) | scripts/check-ci-status.sh | low |
| 4 | Harden update-ci-status.sh to report main branch status, not latest dependabot run | scripts/update-ci-status.sh | low |
| 5 | Dependabot: ignore vitest/zod majors until migration specs | .github/dependabot.yml | low |
| 6 | ADR-029 + GOAP_STATE v0.19.14 update + metrics | plans/ADR-029*, plans/GOAP_STATE.md | low |
| 7 | Verify lint, test:unit, validate, build, quality_gate; push PR | — | medium |

## Acceptance Criteria

- [ ] npm ci succeeds (no ERESOLVE) on clean checkout
- [ ] All 9 validation gates pass
- [ ] Unit test coverage >= 80%
- [ ] No lint warnings introduced
- [ ] No type errors introduced
- [ ] Webhook unit tests hermetic (no live DNS)
- [ ] check-ci-status.sh --live correctly reports main failure/pass across CI/Security/Labels/Deploy
- [ ] Existing tests still pass (no regression)
- [ ] Security scan clean (no SSRF, credential leak, injection)

## Open Questions

- [ ] Should wrangler namespace_id 1001-1007 placeholders be validated against Cloudflare dashboard? Deferred to owner if deploy validation fails.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lock regen churn | medium | Pin exact ranges, verify npm ci + tsc + unit locally before push |
| Webhook mock drift from upstream | low | Restore 52603c7 mock bodies verbatim, prettier-formatted |
| CI script jq/gh absence | low | Fall back to cached file with warning, never hard-fail without gh+jq |

## Dependencies

- [ ] origin/main HEAD fcf5fbf (fix branch rebased onto it)

## Out of Scope for This Spec

- Zod v4 migration (21 files)
- Vitest 5 migration (blocked on pool-workers)
- Rate-limit.ts split (currently 496/500, no warning)
- Wrangler ratelimits namespace provisioning
