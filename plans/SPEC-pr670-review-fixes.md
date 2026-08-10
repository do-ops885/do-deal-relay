# PR #670 Review Fixes

## Task

**Title**: Resolve A2A, Durable Object, and Workers AI review findings
**Author**: Buffy
**Date**: 2026-08-04
**Priority**: high

## Goal

Make A2A tasks genuinely asynchronous, persist resumable pipeline state, and declare the Workers AI binding required by the configured runtime.

## Approach

Pass ExecutionContext through the centralized route pipeline, schedule A2A task completion with waitUntil, serialize the full pipeline context at Durable Object checkpoints, and add the native AI binding plus focused tests.

## Non-Goals

- [ ] Not changing the existing research algorithm or referral conversion behavior
- [ ] Not replacing the existing pipeline state machine
- [ ] Not enabling an external AI Gateway without explicitly supplied production credentials
- [ ] Not modifying unrelated PR #670 dashboard work

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Thread ExecutionContext through pipeline handlers and make A2A task processing background work | worker/lib/middleware, worker/router.ts, worker/routes/a2a.ts, tests/unit | high |
| 2 | Persist and restore the complete JSON-safe pipeline context at phase boundaries | worker/durable-objects/pipeline-executor.ts, tests/unit | high |
| 3 | Declare Workers AI binding and explicit gateway flags; test native fallback | wrangler.jsonc, tests/unit | medium |
| 4 | Run typecheck, focused tests, formatting, and review the final diff | repository | medium |

## Acceptance Criteria

- [ ] `tasks/send` returns a working task record without awaiting research
- [ ] Background task completion writes completed or failed state to DEALS_LOG
- [ ] Pipeline route handlers receive ExecutionContext without breaking existing handlers
- [ ] Durable Object checkpoints restore candidates, normalized, deduped, validated, scored, snapshots, metrics, and errors
- [ ] Checkpoint advances to the next phase only after its context is persisted
- [ ] Wrangler declares the `AI` binding used by the Workers AI helper
- [ ] Focused tests cover async task scheduling, checkpoint serialization, and native AI execution
- [ ] Typecheck and formatting pass
- [ ] Existing tests remain green

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Background A2A work outlives request execution | high | Use `ctx.waitUntil`; keep task state durable in KV and isolate failures in the worker promise |
| Serialized pipeline data becomes incompatible | high | Store an explicit context field, restore defaults, and resume phases at persisted boundaries |
| AI binding differs by deployment environment | medium | Declare the binding at root and keep gateway opt-in until credentials are configured |
