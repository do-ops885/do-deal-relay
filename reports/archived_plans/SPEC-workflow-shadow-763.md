# PEV Spec — shadow-mode discovery workflow (issue #763)

## Task

**Title**: Shadow-mode Cloudflare Workflow for discovery, ADR-018 wave 1
**Author**: opencode + GOAP swarm
**Date**: 2026-09-09
**Priority**: high

## Goal

Prove per-source failure isolation with a read-only shadow workflow that
runs after the main pipeline without touching production state.

## Approach

Add a `DiscoveryShadowWorkflow` with one durable step per source wrapping
the read-only fetch+parse core, triggered fire-and-forget from the 6h cron
behind a default-off flag; the main pipeline path is untouched.

## Non-Goals

Explicitly state what we are NOT doing:

- [ ] Not migrating validate/publish/notify phases (later waves)
- [ ] Not cutting over cron to the workflow (shadow only, no lock taken)
- [ ] Not writing KV/D1/breaker state from workflow steps
- [ ] Not touching personalized deal alerts (issue #764, next wave)

## Steps

Decompose into the smallest steps that each leave the repo green:

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Agent A: wrangler `workflows` binding, Env type, default-off flag | wrangler.jsonc, worker/types/api.ts, worker/lib/feature-flags.ts | low |
| 2 | Core: extract read-only per-source fetch+parse helper from discover.ts | worker/pipeline/discover.ts | medium |
| 3 | Core: workflow class + index export + flag-gated scheduled trigger | worker/workflows/discovery-shadow.ts, worker/index.ts, worker/scheduled.ts | medium |
| 4 | Agent B: unit tests (stub-step run, parity, flag gating) | tests/unit/workflows/*.test.ts | low |
| 5 | Full verification, push, open PR, green CI | — | low |

## Design constraints (official Rules of Workflows)

- Step names deterministic: `discover-{domain}-{run_id}` (no Date.now/random).
- Source list + budgets travel in create() params (computed in Worker
  context); nothing non-deterministic outside steps.
- Steps return compact summaries only ({domain, deal_count, error_count,
  sample codes capped}), far under the 1 MiB step-return limit.
- Steps idempotent and side-effect free: no tally flush, no breaker
  writes, no KV/D1 writes, no PipelineLock acquisition.
- Trigger wrapped in try/catch: shadow failures never fail the cron.
- Unit suite runs on node threads pool: the workflow module imports
  `cloudflare:workers` (type+runtime), so tests import only the pure
  step-logic module and drive `run()` with a stub step object.

## Acceptance Criteria

Concrete, testable statements the Verify phase will check:

- [ ] `npx tsc --noEmit` clean (flag on)
- [ ] `npm run test:unit` green with new workflow tests
- [ ] `./scripts/quality_gate.sh` exits 0, no file over 500 lines
- [ ] Shadow trigger is flag-gated (default off) and exception-isolated
- [ ] Workflow steps perform zero writes (review: no storage/breaker/lock imports in step path)
- [ ] ADR-018 status updated, GOAP_STATE entry added
- [ ] Existing tests still pass (no regression)

## Open Questions

- [ ] None. Binding schema, Entrypoint API, and limits verified against
  official Cloudflare docs (wrangler ^4.129.0, compat 2026-06-13).

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Wrangler binding misconfiguration breaks deploy | high | Follow documented `workflows:[{name,binding,class_name}]` schema; Workers Builds CI verifies |
| `cloudflare:workers` import breaks node unit tests | medium | Import lives only in workflow module + index; tests use pure logic + stub step |
| Shadow fetch load doubles source traffic | low | Flag default off; same budgets/concurrency as main path; enable selectively |
| Step-return size on huge sources | low | Summaries only, sample codes capped |

## Dependencies

- [ ] CI passing on main (verified 2026-09-09)
- [ ] PR #788 (exactOptionalPropertyTypes) merged or independent (this
  branch is cut from main; no dependency)

## Out of Scope for This Spec

- Validate/publish/notify workflow migration, cron cutover, PipelineLock
  retirement, issue #764 deal alerts.
