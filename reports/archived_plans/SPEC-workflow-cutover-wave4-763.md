# PEV Spec — production pipeline cutover to Cloudflare Workflow (issue #763, ADR-018 wave 4)

## Task

**Title**: Flag-gated PipelineWorkflow cutover, PipelineLock retained
**Author**: opencode
**Date**: 2026-09-16
**Priority**: high

## Goal

Cut the 6h cron pipeline over to durable execution: `scheduled()` creates
a `PipelineWorkflow` instance behind a default-off flag instead of calling
`executePipeline` inline. A mid-pipeline eviction or deploy resumes from
the last successful durable step instead of losing the run until the next
6h tick. Legacy direct path stays intact as the flag-off fallback, and
PipelineLock stays as the idempotency guard during transition. No legacy
`state-machine.ts` behavior changes.

## Approach (per official Rules of Workflows, developers.cloudflare.com)

1. New `worker/workflows/pipeline-workflow.ts` with `PipelineWorkflow
   extends WorkflowEntrypoint<Env, PipelineWorkflowParams>`:
   - One durable step per phase group with deterministic names
     (`wf-init-{run_id}`, `wf-discover-{run_id}`, `wf-validate-{run_id}`,
     `wf-score-{run_id}`, `wf-stage-{run_id}`, `wf-publish-{run_id}`,
     `wf-finalize-{run_id}`, `wf-failure-{run_id}`, `wf-release-{run_id}`),
     sanitized run id, no Date.now/random outside steps.
   - No single-step encapsulation (official red flag): discover, validate,
     score, stage, publish, finalize are separate retryable steps. Pure
     CPU phases (normalize, dedupe after discover; verify before
     finalize) ride with their neighbor step — no external calls, so no
     durability is lost.
   - No state outside steps: top-level state is step returns only.
     Deal arrays cross steps via KV handoff keys
     (`wf:{run_id}:{deduped,validated,scored}` on DEALS_STAGING), never
     in step returns — the 500-deal production budget would risk the
     1MiB step-return cap. Metrics (plain data) and error summaries
     ({phase, message} strings, never Error objects) travel in step
     returns. `comparisonCache` (Map, non-serializable) is never built
     on the workflow path.
   - Each phase step mirrors the `state-machine.ts` policy: lock extend
     for discover/validate/publish, phase timing metrics, bounded
     in-step retry for retryable `PipelineError` (`retry_count <
     MAX_RETRIES`, linear backoff), then failure-path return instead of
     a throw. Engine-level step retries stay as the outer layer for
     infrastructure faults.
   - Lock: acquired in the init step (contention → terminal failure
     return, mirroring legacy), released in the release step on every
     path; TTL expiry is the backstop. `previous_snapshot` is never
     assigned anywhere in the codebase, so the failure step passes
     `undefined` (revert branch safely skips).
   - Failure step runs shared `handleFailure` (revert/quarantine/
     concurrency_abort parity, including its notifications), then
     release + handoff cleanup (best-effort), then a terminal
     `{success, phase, error}` return. The workflow never Errors
     without attempting notify + release first.
2. Trigger helper `maybeTriggerPipelineWorkflow(env, run_id, cron)`:
   flag `workflow_pipeline_cutover` (default off) → binding
   `PIPELINE_WORKFLOW` → `create({id: pipeline-{run_id}, params})`.
   Exception-isolated with `flag_disabled` / `binding_missing` /
   `created` / `error` reasons, mirroring `shadow-trigger.ts`.
3. `worker/scheduled.ts` 6h block: attempt cutover first; on
   `triggered: false` run the legacy block byte-identical. Shadow
   trigger + continuous verification stay inline and unchanged.
4. Wiring: `PipelineWorkflowParams` + `PIPELINE_WORKFLOW` on Env
   (optional, local/test fallback), `workflow_pipeline_cutover` default
   flag (enabled false, rollout 0), `worker/index.ts` export,
   `wrangler.jsonc` workflows entry.
5. Tests `tests/unit/workflows/pipeline-workflow.test.ts`: trigger
   matrix (flag off, binding missing, create throws, created +
   deterministic id/params), workflow success path (step names, lock
   acquire/release, handoff put/delete, no notify), failure path
   (handleFailure called with path, release still called, terminal
   return), lock-contention path. Modules mocked at
   `pipeline-executor` / `lock` / `notify` boundaries with stub
   `step.do`.

## Non-Goals

- Not removing the legacy path or PipelineLock (transition period).
- Not per-key/per-deal steps (10,000-step budget is fine, but KV
  handoff per deal would be wasteful; phase granularity matches the
  retry-value profile).
- Not touching shadow workflows, reddit/daily/weekly crons, or #764.

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Env/binding/flag wiring | worker/types/api.ts, worker/lib/feature-flags.ts, worker/index.ts, wrangler.jsonc | low |
| 2 | PipelineWorkflow + trigger | worker/workflows/pipeline-workflow.ts | medium |
| 3 | scheduled() cutover branch | worker/scheduled.ts | medium |
| 4 | Unit tests (trigger + run paths) | tests/unit/workflows/pipeline-workflow.test.ts | low |
| 5 | Full verification, push, open PR, green CI | — | low |

## Design constraints (official Rules of Workflows)

- Deterministic step names (sanitized run id only).
- State = step returns + KV handoff; nothing in-memory across restarts.
- Conditions branch on step returns / event.payload only.
- Every `step.do` awaited; failures recorded/handled, never dangling.
- Step returns compact (counts + metrics + error strings, ≤1MiB).
- `NonRetryableError` reserved for terminal-infra faults only; phase
  policy failures return failure paths (legacy parity).

## Acceptance Criteria

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test:unit` green with new pipeline-workflow tests
- [ ] `./scripts/quality_gate.sh` exits 0, no file over 500 lines
- [ ] Flag off (default) → legacy path byte-identical behavior
- [ ] Binding missing + flag on → legacy fallback, no throw
- [ ] ADR-018 wave-4 note + GOAP_STATE entry added
- [ ] Existing tests still pass (no regression)

## Open Questions

- [ ] None. Per-phase decomposition (vs single-step) chosen per
  official guidance; KV handoff chosen over ctx round-trip due to the
  500-deal budget vs 1MiB step-return cap.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Workflow/legacy policy drift | medium | Mirror state-machine policy line-for-line; shared executePhase/handleFailure; tests pin transitions |
| Lock held after instance Errored | low | Release on all handled paths; 300s TTL expiry backstop; contention throws (fail-closed) |
| Handoff keys left behind on hard crash | low | Best-effort cleanup on release; `wf:` prefix + run_id namespaced; 6h cadence bounds accumulation |
| Flag on without binding in prod | low | Trigger returns binding_missing → legacy fallback; warn logged |

## Dependencies

- [ ] CI passing on main (verified 2026-09-16)
- [ ] Waves 1–3 merged (#789, #805, #808) — present on main

## Out of Scope for This Spec

- Legacy path removal + PipelineLock retirement (follow-up once the
  workflow path proves itself in production), issue #764 deal alerts.
