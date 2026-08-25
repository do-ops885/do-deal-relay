# ADR-022: Durable Object disposition — wire PipelineLock, defer the rest

**Date**: 2026-08-24
**Status**: Accepted
**Context source**: 2026-08-24 codebase analysis (F-4)

## Context

All three Durable Objects declared in wrangler.jsonc and exported from
worker/index.ts have zero runtime invocations:

- PIPELINE_LOCK (worker/durable-objects/pipeline-lock.ts)
- SOURCE_REGISTRY (worker/durable-objects/source-registry.ts)
- DEAL_REGISTRY (worker/durable-objects/deal-registry.ts, 1063-line test suite)

Actual behavior today: pipeline locking runs on D1 CAS via worker/lib/lock.ts;
staging uses KV snapshots; trust evolution runs on D1. This extends MI-4 from
GAP-ANALYSIS-2026-08-15.md to the full ADR-017 subsystem.

## Decision

Wire PipelineLock into the live lock path now; defer SourceRegistry and
DealRegistry disposition to a dedicated sprint with their own ADR.

1. PipelineLock DO becomes the primary acquisition path in worker/lib/lock.ts.
   The DO provides singleton coordination via its actor semantics; the
   existing D1 CAS remains as fallback when the DO binding is unavailable or
   errors. Rationale: highest contention path (every pipeline run), existing
   tests cover both sides, smallest blast radius of the three.
2. DealRegistry: keep code + tests; wiring into stage/publish is a larger
   migration touching publish.ts batching contracts - separate spec required.
3. SourceRegistry: same deferral; trust evolution on D1 works today.

## Consequences

- Lock acquisition gains a single-point coordinator; fallback preserves
  availability if DO fetch fails (fail-open to proven D1 CAS).
- Two subsystems remain intentionally unwired; GOAP_STATE tracks them so they
  are not mistaken for dead code during hygiene sweeps.
- wrangler.jsonc bindings stay as-is; no deploy-surface changes in this step.
