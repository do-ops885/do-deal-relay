# PEV Spec — shadow-mode publish + notify steps (issue #763, ADR-018 wave 3)

## Task

**Title**: Shadow publish/notify dry-run steps after validate batches (wave 3)
**Author**: opencode + GOAP swarm
**Date**: 2026-09-16
**Priority**: high

## Goal

Extend the wave-2 `DiscoveryShadowWorkflow` with `publish-dry-run-{run_id}`
and `notify-dry-run-{run_id}` durable steps that prove the last two risky
phases (publish, notify) in shadow mode with zero writes and zero sends
before any cutover. Completes the shadow coverage of issue #763
(discover + validate + publish + notify); only the cutover (wave 4) remains.

## Approach

1. `worker/pipeline/discover.ts`: extend `ShadowSampleKey` with
   `reward_value: number | null` mapped via the shared
   `getRewardNumericValue(d.reward)` helper (same helper the main
   high-value path uses, so parity is by construction). One scalar per
   key; the 25/source cap is unchanged.
2. New pure module `worker/workflows/publish-shadow.ts` (no
   `cloudflare:workers` import, unit-testable with stub env):
   `planPublishReadonly(env, sampledDealCount)` reads staging + production
   snapshots via `getStagingSnapshot`/`getProductionSnapshot` (KV gets
   only, helpers already swallow errors to null) and returns a compact
   `{staging_present, production_present, hashes_match, would_publish,
   sampled_deals}` summary. `would_publish` is true only when a staging
   snapshot exists and its hash differs from production. Never promotes,
   never inserts referrals, never commits to GitHub, never writes
   metrics/audit. Deterministic `publishStepName(run_id)` with sanitized
   run id.
3. New pure module `worker/workflows/notify-shadow.ts`:
   `summarizeNotifyReadonly(keys, threshold)` counts keys with
   `reward_value !== null && reward_value > threshold` as
   `would_notify` — mirroring `filterHighValueDeals` (`>` strictly) —
   and returns `{checked, would_notify, threshold, by_source}`.
   `planNotifyReadonly(env, keys)` resolves the threshold via the shared
   `getNotificationThreshold(env)` helper and delegates to the pure
   counter. Never calls `notify`, never sends webhooks. Deterministic
   `notifyStepName(run_id)` with sanitized run id.
4. `worker/workflows/discovery-shadow.ts`: after the validate-batch
   steps, run one `publish-dry-run-{run_id}` step (over live KV snapshot
   state, no refetch of sources) and one `notify-dry-run-{run_id}` step
   (over in-memory sample keys, no extra source traffic), aggregated
   into `ShadowRunSummary.publish` / `.notify` blocks. Per-step failure
   isolation: a throwing step is recorded, never thrown.
5. Tests: new `publish-shadow.test.ts` + `notify-shadow.test.ts`
   (dry-run proofs: no puts, no D1 `run`, no `notify`/webhook calls;
   threshold parity incl. strict `>` boundary; step-name determinism +
   sanitize); update `validate-shadow.test.ts` `createKey` helper,
   `discovery-shadow.test.ts` fixtures, `readonly-parity.test.ts`
   expectations for the new `reward_value` field.
6. Docs: ADR-018 wave-3 note + GOAP_STATE entry in the same PR.

## Non-Goals

- Not cutting over cron to the workflow (no lock taken, shadow only).
- Not staging-snapshot construction (stage writes; shadow reads only).
- Not sending any notification (Telegram/GitHub/webhook untouched).
- Not touching issue #764 deal alerts.

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | `reward_value` on shadow sample keys | worker/pipeline/discover.ts | low |
| 2 | Pure publish-shadow module | worker/workflows/publish-shadow.ts | low |
| 3 | Pure notify-shadow module | worker/workflows/notify-shadow.ts | low |
| 4 | Dry-run steps in workflow + summary extension | worker/workflows/discovery-shadow.ts | medium |
| 5 | Unit tests (dry-run, parity, names, wiring) | tests/unit/workflows/*.test.ts | low |
| 6 | Full verification, push, open PR, green CI | — | low |

## Design constraints (official Rules of Workflows)

- Step names deterministic: `publish-dry-run-{run_id}`,
  `notify-dry-run-{run_id}` (sanitized, no Date.now/random).
- Keys travel inside step returns already produced (shadow summaries);
  snapshot reads happen inside the publish step (self-contained replay).
- Steps return compact summaries only, far under the 1 MiB step-return
  limit (scalars + small host-count maps).
- Steps idempotent and side-effect free: KV gets only; no promote, no
  referral inserts, no GitHub calls, no webhook sends, no D1 writes.
- Step failures recorded, never thrown: one bad step cannot fail the run.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test:unit` green with new publish/notify shadow tests
- [ ] `./scripts/quality_gate.sh` exits 0, no file over 500 lines
- [ ] New tests prove no KV puts, no D1 writes, no notify/webhook sends
- [ ] New tests prove threshold parity (`>` strictly, shared helpers)
- [ ] Shadow trigger still flag-gated (default off) and exception-isolated
- [ ] ADR-018 wave-3 note + GOAP_STATE entry added
- [ ] Existing tests still pass (no regression)

## Open Questions

- [ ] None. Read-only verified by construction: gets only in publish
  step, pure counting in notify step.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Extra KV reads per shadow run (2 snapshot gets) | low | Flag default off; gets only, error-swallowed helpers |
| Snapshot payload size in step | low | Only hashes/counts leave the step, never deal arrays |
| `reward_value` null for unparseable rewards | low | Nulls counted as non-candidates, same as main filter |

## Dependencies

- [ ] CI passing on main (verified 2026-09-16)
- [ ] Wave 2 merged (#805) — present on main

## Out of Scope for This Spec

- Cron cutover + PipelineLock retirement (wave 4), issue #764 deal
  alerts.
