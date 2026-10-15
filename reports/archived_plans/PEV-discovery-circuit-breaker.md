# PEV Spec — Discovery Circuit Breaker (F-10)

**Title**: Add circuit breaker to discovery fetches (F-10)
**Author**: opencode
**Date**: 2026-09-02
**Priority**: medium

## Goal
Prevent cascade failures by adding circuit breaker to `discoverFromSource` similar to research-agent orchestrator, per GOAP F-10.

## Approach
Create `worker/lib/circuit-breaker.ts` generic breaker (open after 5 failures, half-open after 30s, close after 3 successes) and wire `isCircuitOpen`/`recordSuccess`/`recordFailure` into `discoverFromSource` — skip fetch when open, record result per pattern batch, keep tally logic.

## Non-Goals
- Not changing budget or trust filtering
- Not refactoring snapshot parse (F-8) — separate spec
- Not adding new retry policy

## Steps
| Step | Description | Files Touched | Risk |
| 1 | Create generic circuit-breaker module | worker/lib/circuit-breaker.ts | low |
| 2 | Wire breaker into discover.ts (check before fetch, record after) | worker/pipeline/discover.ts | low |
| 3 | Add unit tests for breaker | tests/unit/circuit-breaker.test.ts | low |

## Acceptance Criteria
- [ ] `worker/lib/circuit-breaker.ts` exists <100 lines, tested
- [ ] `discoverFromSource` skips when circuit open and records successes/failures
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test:unit` passes (new tests green)
- [ ] `./scripts/pev-gates.sh` format/typecheck pass (ci-workflow-validator BLOCKED-3 triaged per ADR-021)

## Open Questions
- None

## Risk Assessment
| Risk | Impact | Mitigation |
| Breaker false open | low | 30s half-open + 3 success close restores |
