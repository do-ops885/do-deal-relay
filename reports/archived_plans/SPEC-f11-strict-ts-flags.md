# PEV Spec — F-11 Strict TS Flags

## Task

**Title**: Enable noUnusedLocals/noUnusedParameters and clear 408 unused-symbol errors
**Author**: opencode
**Date**: 2026-09-03
**Priority**: high

## Goal

Make banned dead-code patterns compiler-enforced by enabling `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json` with zero errors.

## Approach

Fix all 408 unused-symbol errors file-by-file (delete unused imports, `_`-prefix unused params, delete side-effect-free unused locals), then flip the flags on.

## Non-Goals

Explicitly state what we are NOT doing:

- [ ] Not touching N-3 logging consolidation
- [ ] Not touching RL-1 DO migration
- [ ] Not rewriting any logic — behavior-preserving edits only
- [ ] Not removing exported symbols (only locals/params/imports flagged by tsc)

## Steps

Decompose into the smallest steps that each leave the repo green:

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Fix `worker/` production code (115 errors) | worker/**/*.ts | low |
| 2 | Fix `bot/` + `scripts/` + root (27 errors) | bot/, scripts/ | low |
| 3 | Fix `tests/` (266 errors) in batches with focused test runs | tests/**/*.ts | low |
| 4 | Enable both flags in tsconfig, run tsc + lint + unit + quality gate | tsconfig.json | medium |
| 5 | Update GOAP_STATE F-11 to CLOSED, open PR | plans/GOAP_STATE.md | low |

Fix rules: unused imports are deleted; unused params are `_`-prefixed (signatures stay compatible); unused locals are deleted only if the initializer is side-effect-free, otherwise `_`-prefixed. `tsc --noEmit` re-run after each batch.

## Acceptance Criteria

Concrete, testable statements the Verify phase will check:

- [ ] `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` reports zero errors
- [ ] `npx tsc --noEmit` (baseline flags) still clean
- [ ] `npm run lint` clean (tsc + prettier)
- [ ] Focused vitest runs green for touched areas; full `npm run test:unit` green
- [ ] `./scripts/quality_gate.sh` passes
- [ ] No runtime behavior change (imports/params/locals only, no logic edits)
- [ ] Existing tests still pass (no regression)

## Open Questions

If ambiguous, surface here instead of guessing:

- [ ] None — error list is compiler-generated and exhaustive

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Deleting an unused local whose initializer has side effects | medium | Delete only side-effect-free initializers; `_`-prefix otherwise |
| Touching 100+ files creates merge conflicts | low | Single branch, fast execution, rebase on main before PR |
| Test edits break test intent | low | Unused-symbol edits cannot change behavior; focused test runs per batch |

## Dependencies

- [ ] CI precheck passing (`.github/ci-status/ci-status.json` = passing, verified 2026-09-03; main also green via #742/#744 merges)

## Out of Scope for This Spec

- N-3 parallel logging consolidation (separate sprint)
- RL-1 DO rate-limit migration per ADR-017 (separate Full Mode spec)
- `exactOptionalPropertyTypes` or other stricter flags
