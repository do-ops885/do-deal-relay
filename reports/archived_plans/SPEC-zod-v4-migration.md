# PEV Spec — Zod 3 to 4 Migration (2026-09-07)

## Task

**Title**: Migrate zod ^3.22.4 to ^4.5.4 across 21 files
**Author**: opencode
**Date**: 2026-09-07
**Priority**: high

## Goal

Adopt zod v4 and remove the ADR-029 major pin, with zero API response shape change.

## Approach

Bump the dependency, then fix each v3-only API at its call site: two-arg record, issues accessor, datetime audit. Verify with typecheck plus the full unit suite.

## Non-Goals

- [ ] Not changing any validation semantics (same accepted/rejected inputs)
- [ ] Not changing API error response shapes (v3 `.errors` is the same reference as `.issues`, verified empirically)
- [ ] Not touching vitest 5 (still blocked on pool-workers 0.22.0 peers)
- [ ] Not rewriting schemas beyond the mechanical v4 fixes

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | ADR-030 + this spec + GOAP tracking | plans/ | low |
| 2 | Bump zod to ^4.5.4, regen lock, remove dependabot zod ignore | package.json, package-lock.json, .github/dependabot.yml | low |
| 3 | Fix 7x single-arg `z.record(v)` to two-arg form | email/types, types/{api,referral,pipeline}, mcp/schemas | low |
| 4 | Replace ~10x `validation.error.errors` with `.issues` | routes/nlq/*, referrals*, submit, import, referral-research | low |
| 5 | Audit `datetime()`/`email()`/`url()`/`coerce` behavior deltas via suite | types/*, email/types, mcp handlers | medium |
| 6 | Full verify: lint, test:unit, validate, build, quality_gate | — | medium |

## Acceptance Criteria

- [ ] `npm ci` succeeds with zod 4.5.4 installed
- [ ] `npx tsc --noEmit` clean
- [ ] All 9 validation gates pass
- [ ] Unit test coverage >= 80%, full suite green with no snapshot/shape updates needed
- [ ] No lint warnings introduced
- [ ] 400-response `details` payloads byte-identical to v3 (issues alias verified)
- [ ] Dependabot zod major ignore removed

## Open Questions

- [ ] v4 `datetime()` offset strictness: suite will confirm; tighten schemas only if tests demand it

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| v4 stricter string formats reject previously-valid inputs | medium | Full 2905-test suite covers deal/referral/email schemas; any delta shows up as test failure before merge |
| Nested zod via pool-workers (4.4.3) conflicts | low | Pool keeps its own nested copy; root uses 4.5.4; npm-peer check is the gate |

## Dependencies

- [ ] origin/main green at 5aff7e5 (verified 6/6 success)

## Out of Scope for This Spec

- Vitest 5 migration (upstream block, ADR-029 stands for vitest only)
