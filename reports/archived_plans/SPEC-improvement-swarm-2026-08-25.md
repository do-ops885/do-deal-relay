# PEV Spec — Improvement Swarm 2026-08-25

## Task

**Title**: Improvement swarm — KV pagination, non-null assertion sweep, popup split, wrangler AI binding, test-gap coverage
**Author**: ox-alpha (GOAP orchestrator)
**Date**: 2026-08-25
**Priority**: high

## Goal

Close the highest-value open inventory items (F-7, N-5, F-12 ai-block + popup residual, T-6/T-7/T-8) via a parallel agent swarm with disjoint file scopes.

## Approach

Five parallel workstreams on one branch, each verified by typecheck plus targeted unit tests; orchestrator commits each workstream atomically after independent review of its diff.

## Non-Goals

- [ ] Not wiring AI Gateway into NLQ (MI-3 stays deferred — product/cost decision)
- [ ] Not adding circuit breaker to discovery (F-10 stays deferred — fail-open/closed design needed)
- [ ] Not unifying logging subsystems (N-3), not deduping D1 route boilerplate (F-12 remainder), not touching tsconfig strict flags (F-11)
- [ ] Not editing worker/config.ts, worker/index.ts, or worker/lib/security.ts

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| WS-A | KV list cursor-pagination helper + apply at 10 truncation sites | worker/lib/kv-pagination.ts (new), routes/dashboard.ts, routes/core/health.ts, lib/feature-flags.ts, lib/cache.ts, lib/webhook/delivery.ts, lib/logger/query.ts, lib/rate-limit-kv.ts, lib/storage.ts, lib/auth.ts, tests/unit/kv-pagination.test.ts (new) | medium |
| WS-B | Replace banned non-null assertions in route files (~19 sites) | routes/core/deals.ts, routes/d1/deals.ts, routes/core/pipeline.ts, routes/core/analytics.ts, routes/bulk/export.ts, routes/referrals.ts | medium |
| WS-C | Replace banned non-null assertions in lib and pipeline files (~36 sites) | nlq/query-builder/executor.ts, ranking.ts, categorization/scoring.ts, jwt.ts, webhook/sync-executor.ts, pipeline/dedupe.ts, circuit-breaker.ts, middleware/pipeline.ts, search/embedding-pipeline.ts, referral-storage/search.ts, validation/code-validator.ts, validation/url-validator.ts, crypto.ts, config-utils.ts, validation/scrapers/batch-processor.ts, scheduled.ts, pipeline-executor.ts | medium |
| WS-D | Split extension/popup.js under 500 lines (no build step; add second script tag) | extension/popup.js, extension/popup-render.js (new), extension/popup.html | low |
| WS-E | Focused tests: SourceRegistry DO, D1 trust.ts, lib/expiration helpers | tests/unit/source-registry.test.ts, tests/unit/d1-trust.test.ts, tests/unit/expiration-helpers.test.ts (all new) | low |
| WS-F | Declare Workers AI binding in wrangler.jsonc (env.AI used by embedding-pipeline) | wrangler.jsonc | low |

## Acceptance Criteria

- [ ] All KV list() call sites iterate cursors until done (bounded loop cap)
- [ ] Zero non-null assertions remain in the files listed above (string-literal false positives excluded)
- [ ] extension/popup.js and all extracted chunks <= 500 lines
- [ ] wrangler.jsonc declares `"ai": { "binding": "AI" }`
- [ ] New test files pass; full unit suite green (no regressions vs baseline)
- [ ] `npx tsc --noEmit` clean; `npm run fmt:check` clean; `npm run lint:md` clean
- [ ] No file exceeds 500 lines; no `as any` introduced; no comments unless required

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pagination helper changes auth/apikey lookup behavior | high | Bounded loop identical semantics; existing auth tests must stay green |
| Assertion replacements alter edge-case control flow | medium | Explicit guards throwing typed errors; 2600-test suite as regression net |
| Parallel agents race shared state | medium | Disjoint file scopes; agents never commit; orchestrator serializes commits |
| popup.js split breaks extension | medium | Plain script-tag extraction only; no manifest changes beyond none needed |

## Dependencies

- Baseline pev-gates green except documented BLOCKED-3 gate (verified 2026-08-25)

## Out of Scope for This Spec

- MI-3 AI Gateway wiring, F-8 snapshot pass-through, F-10 discovery breaker, F-11 tsconfig flags, F-12 D1 boilerplate dedupe, SourceRegistry/DealRegistry stage-publish disposition
