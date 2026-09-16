# PEV Spec — shadow-mode validate-batch steps (issue #763, ADR-018 wave 2)

## Task

**Title**: Shadow validate-batch steps after shadow discovery (wave 2)
**Author**: opencode + GOAP swarm
**Date**: 2026-09-13
**Priority**: high

## Goal

Extend the wave-1 `DiscoveryShadowWorkflow` with `validate-batch-{n}` durable
steps that dry-run the fast-path validation cache lookups over
shadow-discovered deals. Proves the next riskiest phase (validate) in shadow
mode with zero writes before any cutover.

## Approach

1. `worker/pipeline/discover.ts`: extend `ShadowSourceSummary` with capped
   `sample_keys: Array<{url, fingerprint}>` (`fingerprint` = `deal.id`,
   identical to the main path in `worker/validation/pipeline.ts`).
2. New pure module `worker/workflows/validate-shadow.ts` (no
   `cloudflare:workers` import, unit-testable with stub step objects):
   `validateBatchReadonly(env, keys)` mirrors the `validateDealFastPath`
   hit/miss decisions (KV fingerprint-duplicate, KV url accepted/rejected,
   D1 index row) via gets/selects only — it never invokes `persist` and
   never repopulates KV from D1, so zero writes — and returns a compact
   `{checked, hits, misses, by_source}` summary.
   Batching helper `chunkShadowKeys(summaries, size)` with
   `SHADOW_VALIDATE_BATCH_SIZE = 50`; deterministic
   `validateBatchStepName(index, run_id)` names.
3. `worker/workflows/discovery-shadow.ts`: after the per-source steps, run
   one `validate-batch-{i}-{run_id}` step per chunk over in-memory summaries
   (no refetch, no extra source traffic) and aggregate into an extended
   `ShadowRunSummary.validate` block. Per-batch failure isolation: a throwing
   batch is recorded, never thrown.
4. Trigger unchanged: same flag (`workflow_shadow_discovery`, default off),
   same fire-and-forget path, no lock.

## Non-Goals

- Not migrating publish/notify phases (wave 3).
- Not cutting over cron to the workflow (no lock taken, shadow only).
- Not writing KV/D1/breaker state from any step.
- Not touching issue #764 deal alerts.

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | `sample_keys` on shadow summaries (capped) | worker/pipeline/discover.ts | low |
| 2 | Pure validate-shadow module | worker/workflows/validate-shadow.ts | low |
| 3 | Batch steps in workflow + summary extension | worker/workflows/discovery-shadow.ts | medium |
| 4 | Unit tests (dry-run, batching, names, workflow wiring) | tests/unit/workflows/validate-shadow.test.ts, discovery-shadow.test.ts | low |
| 5 | Full verification, push, open PR, green CI | — | low |

## Design constraints (official Rules of Workflows)

- Step names deterministic: `validate-batch-{i}-{run_id}` (no Date.now/random).
- Keys travel inside step returns already produced (discover steps); nothing
  non-deterministic outside steps.
- Steps return compact summaries only, far under the 1 MiB step-return limit
  (capped keys: 25/source samples, 50 keys/batch).
- Steps idempotent and side-effect free: reads only (KV get, D1 select);
  `persist` never called; no tally flush, no breaker writes, no lock.
- Batch failures recorded, never thrown: one bad batch cannot fail the run.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test:unit` green with new validate-shadow tests
- [ ] `./scripts/quality_gate.sh` exits 0, no file over 500 lines
- [ ] New tests prove `persist` is never invoked (dry-run) and KV puts never happen
- [ ] Shadow trigger still flag-gated (default off) and exception-isolated
- [ ] ADR-018 wave-2 note + GOAP_STATE entry added
- [ ] Existing tests still pass (no regression)

## Open Questions

- [ ] None. Read-only verified: gets/selects only, no `persist`, no
  D1-to-KV repopulation (the main-path `validateDealFastPath` repopulates
  KV on D1 hits, so shadow duplicates its decision logic without writes).

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Extra KV/D1 read load per shadow run | low | Flag default off; capped keys; reads only |
| Step-return size on huge sources | low | 25 keys/source cap, 50/batch cap, scalar-only payloads |
| `cloudflare:workers` import breaks node unit tests | medium | Import lives only in workflow module; pure logic tested standalone |

## Dependencies

- [ ] CI passing on main (verified 2026-09-13)
- [ ] Wave 1 merged (#789) — present on main

## Out of Scope for This Spec

- Publish/notify shadow steps (wave 3), cron cutover + PipelineLock
  retirement (wave 4), issue #764 deal alerts.
