# PEV Spec — Snapshot Pipeline Optimize (F-8)

**Title**: Eliminate double hash and duplicate KV re-parses in stage/publish (F-8)
**Author**: opencode
**Date**: 2026-09-02
**Priority**: medium

## Goal
Reduce snapshot re-parses from ~5x to 2x per run and eliminate double hash computation in stage/publish path.

## Approach
Add cached helpers in `worker/lib/storage.ts` (`putStagingSnapshot` direct write + `promoteStagingToProduction` with injected staging/production) and repoint `worker/pipeline/stage.ts` and `worker/publish.ts` to reuse already-fetched snapshots and already-computed hash.

## Non-Goals
- Not changing validation or schema
- Not touching circuit breaker (F-10 done)
- Not adding new storage backend

## Steps
| Step | Description | Files Touched | Risk |
| 1 | Add putStagingSnapshot + promoteStagingToProduction cached variants | worker/lib/storage.ts | low |
| 2 | Stage: reuse hash, write via putStagingSnapshot, verify with cached read | worker/pipeline/stage.ts | low |
| 3 | Publish: reuse staging+production fetched in steps 1-2, promote via cached helper | worker/publish.ts | low |

## Acceptance Criteria
- [ ] No second `generateSnapshotHash` call in stage path for same deals array
- [ ] `promoteToProduction` not double-fetching staging/production when caller already has them
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test:unit` passes
- [ ] pev-gates format/typecheck pass (ci-workflow-validator triaged)

## Open Questions
- None

## Risk Assessment
| Risk | Impact | Mitigation |
| Cached snapshot stale vs KV | low | Hash chain check still validates against cached prod snapshot; fallback to fetch if null |
