# SPEC: Durable Object cutover (SourceRegistry, DealRegistry)

**Title**: Durable Object cutover for the two unwired registries
**Author**: buffy (agent)
**Date**: 2026-11-01
**Priority**: low
**Issue**: #997 (F-4)
**Decision**: [ADR-035](ADR-035-durable-object-cutover.md)

## Goal

Give the SourceRegistry/DealRegistry cutover an executable shape so #997 can be
started without re-deriving the design, while keeping KV/D1 canonical until a
measured trigger fires.

## Approach

Cut over one registry at a time behind dual-write, then DO-read-with-fallback,
then mirror removal, as defined in ADR-035. Nothing runs until a trigger is
measured.

## Non-Goals

- [ ] Not migrating `PipelineLock` — already primary per ADR-022.
- [ ] Not changing rate limiting — RL-1 is closed via ADR-028.
- [ ] Not removing KV or D1 storage for deals or sources.
- [ ] Not changing `wrangler.jsonc` bindings or migration tags before Phase 1.

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 0 | Record the trigger measurement (incident or failing concurrency test) in the PR | `plans/` | low |
| 1 | Add `extends DurableObject` to the target class and keep RPC signatures identical | `worker/durable-objects/*.ts` | low |
| 2 | Turn the mirror into dual-write with canonical reads | `worker/lib/do-mirror.ts`, caller | medium |
| 3 | Add DO-read with KV/D1 fallback behind a feature flag | `worker/lib/feature-flags*`, caller | medium |
| 4 | Flip one environment; hold for a full weekly cycle with fallback counts at zero | `wrangler.jsonc` env blocks | high |
| 5 | Remove the mirror path and the old writes | caller, `do-mirror.ts` | medium |

Step 1 is the only part required to unblock the class-level cutover; steps 2–5
are the promotion and are reversible at each step.

## Acceptance Criteria

- [ ] Standing instruction `validatedFetch` untouched; no new outbound fetch.
- [ ] Concurrent-stage test proves no lost update that the old path allowed.
- [ ] Fallback counter observable in `/metrics` while both paths are live.
- [ ] Rollback verified by restoring the previous feature-flag value.
- [ ] No type errors (`tsc --noEmit`), no lint or format regressions.
- [ ] Existing test suites pass, including the `deal-registry` suite.
- [ ] `worker/index.ts` exports and `wrangler.jsonc` bindings agree with the
      class names.

## Open Questions

- [ ] Which registry is first if the trigger is a publish-path incident rather
      than a staging-path incident?
- [ ] Does the weekly cycle need a manual verification step, or is the existing
      nightly workflow sufficient evidence?

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| DO write path diverges from canonical store | high | Dual-write first, canonical reads throughout |
| Binding/tag mismatch breaks deploy | high | `wrangler deploy --dry-run` for staging and production in the PR |
| Silent fallback masks a broken DO path | medium | Fallback counter in metrics, alert before removing the mirror |
| Migration drags on | low | Each registry is an independent PR with its own rollback |

## Dependencies

- [ ] Owner approval and sprint scheduling (ADR-035 decision owner).
- [ ] A measured trigger: incident evidence or a failing concurrency test.

## Out of Scope for This Spec

- Deal/source schema changes beyond what the DO classes already model.
- Removing the KV mirror bookkeeping used by `do-mirror.ts` reporting.
- Any rate-limit or lock work (ADR-022, ADR-028).
