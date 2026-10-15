# PEV Spec — D1 Boilerplate DRY (F-12)

**Title**: Deduplicate D1 route boilerplate (getD1Logger + DEALS_DB guard)
**Author**: opencode
**Date**: 2026-09-02
**Priority**: medium

## Goal
Eliminate ~250 lines of duplicated D1 boilerplate across `worker/routes/d1/**` by extracting shared helpers.

## Approach
Create `worker/routes/d1/helpers.ts` exporting `getD1Logger(env)` and `requireD1(env)` and repoint 4 route files to it.

## Non-Goals
- Not changing D1 query logic or auth
- Not fixing tsconfig flags (F-11) or logging divergence (N-3)
- Not adding new D1 endpoints

## Steps
| Step | Description | Files Touched | Risk |
| 1 | Create helpers module with getD1Logger + requireD1Db | worker/routes/d1/helpers.ts | low |
| 2 | Repoint admin.ts, deals.ts, search.ts, stats.ts to helpers | worker/routes/d1/*.ts | low |
| 3 | Verify gates + update GOAP_STATE | plans/GOAP_STATE.md | low |

## Acceptance Criteria
- [ ] `worker/routes/d1/helpers.ts` exists and is <100 lines
- [ ] No duplicated `function getD1Logger` in 4 files (single import)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test:unit` passes (no regression)
- [ ] `./scripts/pev-gates.sh` 12/13 (only ci-workflow-validator BLOCKED-3 per ADR-021)
- [ ] `npm run lint` (prettier) passes

## Open Questions
- None

## Risk Assessment
| Risk | Impact | Mitigation |
| Duplicated logger signature drift | low | Single helper, tested via existing d1 route tests |

## Dependencies
- None

## Out of Scope
- Circuit breaker on discovery (F-10) — separate spec
- tsconfig strict flags — dedicated sweep
