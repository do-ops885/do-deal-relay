# PEV Spec — T-2/T-3/T-4 Test Gaps

## Task

**Title**: Close deferred unit-test gaps T-2, T-3, T-4
**Author**: opencode
**Date**: 2026-09-05
**Priority**: high

## Goal

Add focused unit suites for the three untested orchestration layers
(email routes/handlers, NLQ AI enhancer + hybrid classifier, validation
scraper internals) without touching production code.

## Approach

Pure test additions using established seams (vi.mock referral-storage,
validateSecurity, validatedFetch; injected Ai stub; Map-backed KV).
Real parseCommand, templates, extraction, and crypto stay unmocked so
dispatch paths are genuinely exercised.

## Non-Goals

- [ ] Not touching any file under `worker/` (tests + spec + GOAP only)
- [ ] Not rewriting existing test files (only extend where the 500-line
  limit allows; otherwise new files)
- [ ] Not adding production features, bindings, or migrations
- [ ] Not covering REDDIT-5, RL-1, or CI-1 (separate tracks)

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | T-2: email route + handler orchestration suites | `tests/unit/routes/email.test.ts`, `tests/unit/email/handlers.test.ts` | low |
| 2 | T-3: NLQ AI enhancer + rule/hybrid classifier suites | `tests/unit/nlq/ai-enhancer.test.ts`, `rule-classifier.test.ts`, `hybrid-classifier.test.ts` | low |
| 3 | T-4: change-detector + batch-processor suites | `tests/unit/change-detector.test.ts`, `batch-processor.test.ts` | low |
| 4 | Full verify + GOAP flip T-2/T-3/T-4 to CLOSED | `plans/GOAP_STATE.md` | low |

## Acceptance Criteria

- [ ] `npm run test:unit` fully green (no regressions, new suites pass)
- [ ] `npx tsc --noEmit` clean (no `any` leaks; banned patterns hold)
- [ ] `prettier --check` and `markdownlint` clean
- [ ] `./scripts/quality_gate.sh` exit 0
- [ ] Every new test file under 500 lines (`MAX_LINES_PER_SOURCE_FILE`)
- [ ] No network, AI, Vectorize, or KV credentials required by new tests
- [ ] Existing tests still pass (no regression)

## Open Questions

- [ ] None. Scoping (2026-09-05) confirmed seams and file layout.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flaky timing (`Date.now` codes, 1s batch delay) | low | Single-deal batches; avoid wall-clock asserts |
| Mock drift from production signatures | low | Mock at module seams already used by bulk tests |
| File-limit breach on extension approach | low | New files per item; never extend near-limit files |

## Dependencies

- [ ] None. No prod code, infra, secrets, or other tracks required.

## Out of Scope for This Spec

- REDDIT-5 coverage (separate track, own spec if needed)
- RL-1 DO migration (needs ADR + staging probe)
- No ADR for this spec: zero production or architectural change.
