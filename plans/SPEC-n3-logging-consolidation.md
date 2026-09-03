# PEV Spec — N-3 Logging Consolidation

## Task

**Title**: Single-source the duplicated console-logger factory and console-emit paths
**Author**: opencode
**Date**: 2026-09-03
**Priority**: medium

## Goal

Eliminate the parallel logging implementations flagged in N-3 without changing log output or runtime behavior.

## Approach

Triage first: `worker/lib/logger/*` is durable KV run-log storage (not a console-logger duplicate) and already reports its own errors via `global-logger`, so it stays layered as-is. Consolidate only the true duplication: `bot/lib/logger.ts` duplicates the worker factory line-for-line, and `StructuredLogger` carries its own `console.*` switch. Single-source both behind `worker/lib/global-logger.ts`.

## Non-Goals

Explicitly state what we are NOT doing:

- [ ] Not touching N-3-excluded durable run-log behavior (`appendLog`, `LogBuilder`, query, export)
- [ ] Not changing any log message content (one disclosed exception: structured-mirror debug entries move from `console.debug` to `console.log`, same stdout stream — see ADR-025)
- [ ] Not touching RL-1 DO migration
- [ ] Not rewriting any logic — behavior-preserving edits only

## Steps

Decompose into the smallest steps that each leave the repo green:

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Export `emitConsole(level, output)` from `global-logger.ts` and use it in its own `log()` | worker/lib/global-logger.ts | low |
| 2 | Route `StructuredLogger` console mirror and fallbacks through `emitConsole` | worker/lib/logger/structured.ts | low |
| 3 | Replace `bot/lib/logger.ts` factory duplicate with re-exports from worker (omit worker-labelled default `logger`) | bot/lib/logger.ts | low |
| 4 | Run tsc + lint + logger/bot focused tests + full unit suite + quality gate | — | medium |
| 5 | Update GOAP_STATE N-3 to CLOSED, record ADR-025 | plans/ | low |

Fix rules: console routing changes must preserve the exact `console.error`/`warn`/`log` method selection per level; bot re-exports must keep every name its 2 importers and `tests/unit/bot/lib-logger.test.ts` use.

## Acceptance Criteria

Concrete, testable statements the Verify phase will check:

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean (tsc + prettier)
- [ ] `npm run test:unit` green (2749+ tests, zero regressions)
- [ ] `./scripts/quality_gate.sh` passes with zero warnings
- [ ] No `console.*` call remains in `worker/lib/logger/structured.ts`
- [ ] `bot/lib/logger.ts` contains no duplicated factory logic
- [ ] Existing tests still pass (no regression)

## Open Questions

If ambiguous, surface here instead of guessing:

- [ ] None — duplication is compiler- and grep-verified, call sites enumerated

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bot tier cannot import worker module at runtime | medium | Precedent exists (`bot/api-client.ts` imports `../worker/types`); `global-logger.ts` has zero imports so no dependency bleed |
| Console-method routing change alters log capture | low | `emitConsole` preserves the exact level-to-method mapping; focused logger tests re-run |
| Frozen worker default `logger` leaks into bot logs | low | Explicit named re-exports omit `logger`; documented in ADR-025 |

## Dependencies

- [ ] CI precheck passing (`.github/ci-status/ci-status.json` = passing, verified 2026-09-03)

## Out of Scope for This Spec

- N-3-adjacent durable run-log redesign (separate Full Mode spec if ever needed)
- F-11 branch merge (this work stacks in the same tree; commit separately)
- `exactOptionalPropertyTypes` or other stricter flags
