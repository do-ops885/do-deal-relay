# ADR-035: Durable Object cutover for SourceRegistry and DealRegistry

**Date**: 2026-11-01
**Status**: Proposed
**Related**: ADR-017 (migration plan), ADR-022 (PipelineLock-first disposition),
ADR-028 (rate limiting over the native binding)

## Context

Phase 2 of ADR-017 — moving `SourceRegistry` and `DealRegistry` to
`extends DurableObject` — was deferred by ADR-022. Current state, verified
2026-11-01:

- `worker/durable-objects/pipeline-lock.ts:56`, `source-registry.ts:73`, and
  `deal-registry.ts:70` are plain classes; none extends `DurableObject`.
- `PipelineLock` is wired as the primary lock path per ADR-022.
- `SourceRegistry`/`DealRegistry` are reachable only through
  `worker/lib/do-mirror.ts`, which is best-effort: every call is raced against a
  timeout and swallowed in a `catch`. KV and D1 remain canonical.
- `DealRegistry` carries a large test suite but no production consumer.
- The rate-limit race that originally motivated DO adoption (RL-1) was closed
  by ADR-028 using the native rate-limit binding, so DOs are no longer required
  for that surface.

Nothing in the current system is broken by the deferral. The cost of the
deferral is carrying two unwired stateful subsystems and their tests.

## Decision (proposed)

Do not schedule the cutover on architectural grounds alone. Start it only when
one of these triggers is measured:

1. A staging or production incident shows KV/D1 staleness affecting deal
   staging/publishing decisions.
2. A concurrency test demonstrates a lost update in the staging or publish
   path that a single-writer actor would prevent.

If a trigger fires, cut over one registry at a time under this contract:

- **Dual-write, KV/D1 read**: write to the DO and the canonical store; read from
  the canonical store. Run for at least one full weekly cycle.
- **DO read with fallback**: read the DO, fall back to KV/D1 when the stub is
  missing or throws. Never fail a publish because of the mirror.
- **Remove the mirror**: only after the DO path is the sole reader for one
  cycle with zero fallbacks.

`SourceRegistry` and `DealRegistry` cuts are separate changes with separate
rollbacks.

## Consequences

- The deferral remains intentional; GOAP keeps tracking it so it is not
  mistaken for dead code.
- No `wrangler.jsonc` binding or migration-tag change until a trigger fires.
- If neither trigger fires within the next two review cycles, the alternative
  outcome is retiring the mirror path and keeping KV/D1 canonical, which is a
  smaller change than the cutover.

## Decision owner and blockers

Owner approval is required before any phase begins. Blockers for this ADR:
scheduling inside a dedicated sprint, and an explicit measurement for one of
the two triggers above. Scoped execution plan:
[SPEC-durable-object-cutover.md](SPEC-durable-object-cutover.md).
