# PEV Spec — Missing-Implementation Sweep

---

## Task

**Title**: Wire DO mirrors, ops routes, MCP progress tools, semantic filters
**Author**: opencode
**Date**: 2026-09-04
**Priority**: high

## Goal

Close verified-open missing implementations without breaking deploys: DO runtime callers, unregistered handlers, ignored search filters, misleading MF-2 docs.

## Approach

Best-effort mirrors with KV/D1 canonical plus isolated failures; new routes behind existing auth and rate limiting; no wrangler migrations changes.

## Non-Goals

Explicitly state what we are NOT doing:

- [ ] Not migrating DO classes to extends DurableObject (deferred: unit pool uses threads, wrangler bans migrations blocks)
- [ ] Not cutting KV/D1 over to DO as single source of truth (deferred ADR-017 Phase 2 design)
- [ ] Not forcing real-fetch default in dev (subrequest budget and rate-limit guard stay)
- [ ] Not splitting extension/popup.html (low ROI, breakage risk)
- [ ] Not writing exhaustive T-2/T-3/T-4 email/NLQ/scraper suites (focused wiring tests only)

## Steps

Decompose into the smallest steps that each leave the repo green:

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Remove non-null assertions in NLQ delete and referral pagination | worker/routes/nlq/index.ts, worker/routes/referrals.ts | low |
| 2 | Add best-effort DO mirror helper and wire stage/publish/trust | worker/lib/do-mirror.ts, worker/pipeline/stage.ts, worker/publish.ts, worker/pipeline/score.ts | medium |
| 3 | Wire bulk/dashboard ops routes via extracted router plus email entrypoint | worker/router/ops-routes.ts, worker/router/legacy-routes.ts, worker/index.ts | medium |
| 4 | Register MCP progress tools | worker/lib/mcp/tools/system.ts | low |
| 5 | Apply semantic-search filters and fix MF-2 docs | worker/routes/semantic-search.ts, worker/lib/research-agent/orchestrator/index.ts | medium |
| 6 | Add wiring tests and fix tool-count assertion | tests/unit/missing-impl-sweep.test.ts, tests/unit/mcp-tools-definitions.test.ts | low |

## Acceptance Criteria

Concrete, testable statements the Verify phase will check:

- [ ] All 9 validation gates pass
- [ ] Unit test coverage holds with zero regressions (2761 green)
- [ ] No lint warnings introduced
- [ ] No type errors introduced
- [ ] legacy-routes.ts under 500-line limit
- [ ] Zero non-null assertions in worker production code
- [ ] DO mirror failures never throw into pipeline paths
- [ ] Dashboard routes admin-only, bulk routes authenticated and rate-limited
- [ ] Existing tests still pass (no regression)

## Open Questions

If ambiguous, surface here instead of guessing:

- [ ] Question 1: Should DealRegistry become single source of truth in a follow-up ADR-017 Phase 2 spec? (Answered: yes, deferred.)
- [ ] Question 2: Should min_reward filter gain a D1-backed value check? (Deferred: no vector metadata value field.)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| DO RPC failure blocks pipeline | high | Best-effort mirrors with timeout and try/catch, canonical stores unchanged |
| New public routes widen attack surface | high | Admin tier for dashboard, user auth plus rate limiting for bulk, body-size caps |
| Bulk import bypasses validation gates | medium | Single-item path keeps schema plus SSRF checks; batch limits size; follow-up to route through full pipeline |
| Deploy break from DO config change | high | No wrangler migrations changes; exports blocks untouched |

## Dependencies

- [ ] Cloudflare DO bindings present in runtime env (absent bindings fall back cleanly)

## Out of Scope for This Spec

- extends DurableObject base-class migration and DO test-harness move to workers pool
- Full T-2/T-3/T-4 coverage suites
- popup.html split
