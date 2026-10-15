# PEV Spec: PR Triage Sweep + P1 Gap Implementation Swarm

**Title**: Resolve all open PRs, close no-impact changes, implement P1 gap items
**Author**: ox-alpha (GOAP orchestrator)
**Date**: 2026-08-22
**Priority**: high

## Goal

Close out all 13 open PRs with CI green and land the P1 gap-analysis
implementations plus dead-code removals on a single coordinated branch.

## Approach

GOAP swarm: sequential PR lifecycle management first (merge / fix / close),
then parallel agents on disjoint file scopes for MI-5, MI-6, MI-1, MF-2, T-1,
and new findings N-1/N-2, all gated by pev-gates.

## Non-Goals

- Not fixing the 51 banned non-null assertions (N-5) - deferred to a later sweep
- Not consolidating the dual logging subsystems (N-3) - tracked only
- Not wiring AI Gateway (MI-3) or DealRegistry DO (MI-4) - P3
- Not implementing hybrid semantic search (MF-1) - P2, separate spec
- Not touching T-2..T-8 test coverage gaps beyond T-1

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Merge fast-track PRs #695 #699 #704 #705 #703 #707 | none (remote) | low |
| 2 | Fix Codacy findings on #701 (banned cast, hardcoded secret literal) | tests/unit/hmac.test.ts | low |
| 3 | Fix 12 as-any casts in #700 ranking tests via typed overrides | tests/unit/ranking.test.ts | low |
| 4 | Close no-impact JSDoc PRs #697 #702 #706; close #696 as superseded by #700 workers-types bump | none (remote) | low |
| 5 | MI-5/MI-6: verify stashed WIP (expiration consolidation + schema.sql deletion), commit atomically | pipeline-executor.ts, lib/expiration/*, deletions | medium |
| 6 | MI-1: route GET /mcp/stream with auth + rate limit; split legacy-routes.ts under 500 lines | router/*, routes/mcp-stream.ts, lib/mcp/progress.ts | medium |
| 7 | MF-2: default research to real fetching; gate simulateDiscovery behind explicit test flag | research-agent/orchestrator, helpers | medium |
| 8 | T-1: unit tests for batch D1 helpers (audit-log, referrals-batch, system-metrics, research-cache, factory) | tests/unit/d1/*.test.ts (new) | low |
| 9 | N-1/N-2: delete dead worker/lib/webhook-sdk.ts and worker/routes/health.ts after ref-check | deletions | low |

## Acceptance Criteria

- [ ] All 13 open PRs resolved (merged or closed with rationale)
- [ ] Every merged PR shows green checks including Codacy
- [ ] tsc --noEmit clean
- [ ] Unit tests pass (no regression)
- [ ] Prettier and markdownlint clean
- [ ] No source file exceeds 500 lines
- [ ] No new banned patterns introduced
- [ ] GOAP_STATE.md updated to v0.16.0 with outcomes

## Open Questions

None - scope confirmed by operator 2026-08-22.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sequential CI waits slow PR merges | low | auto-merge + parallel work between waits |
| legacy-routes.ts split regresses routing | medium | route table unchanged; typecheck + smoke tests |
| Orchestrator change conflicts with WIP | medium | Agent C runs strictly after Agent A lands |
| Codacy false positives block security fix | medium | fix root cause (no literals/casts) over ignore-listing |

## Dependencies

- CI precheck passing (.github/ci-status/ci-status.json = passing) - verified
- PR #695 merged before plans updates (done)

## Out of Scope for This Spec

N-3..N-5 findings, MI-3/MI-4, MF-1, T-2..T-8 - recorded in GOAP_STATE v0.16.0
for future sprints.
