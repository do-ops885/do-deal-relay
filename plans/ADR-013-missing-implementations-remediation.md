# ADR-013: Missing Implementations Remediation Strategy

**Date**: 2026-06-11
**Status**: Accepted
**Issues**: CI failures, M-1 through M-15 (codebase analysis)

## Context

A comprehensive codebase analysis on 2026-06-11 identified:
- **3 CI failures**: Prettier formatting, npm dependency vulnerability, scheduled discovery endpoint returning empty
- **15 missing implementations** across critical (5), medium (5), and lower priority (5) categories
- **6 skipped tests** masking potential bugs
- **Type safety debt**: `as any`, `as never`, duplicate interfaces, empty catch blocks

Key gaps between spec and implementation:
1. MCP research tool spec says "real web fetching" but implementation only queries the database
2. Webhook system spec defines trigger endpoint and DELETE by ID, but neither is implemented
3. Rate limit metadata is stored on API keys but enforcement is never wired to route handlers
4. Explainability endpoint returns empty validation gate arrays because per-deal gate results are never persisted

## Decision

Adopt a **4-phase remediation strategy** with priority ordering:

### Phase 1: CI Green (prerequisite)
Fix Prettier formatting to unblock all CI workflows. This is the single highest-leverage action.

### Phase 2: Critical Missing Implementations (parallel swarm)
Address the 5 critical gaps that block core functionality:
- MCP research → real pipeline integration
- Rate limit enforcement
- Webhook sync trigger endpoint
- Explainability gate persistence
- Embedding pipeline automation

### Phase 3: Type Safety & Error Handling
Systematic cleanup of type safety debt and silent error swallowing. This improves debuggability and prevents future bugs.

### Phase 4: Test & Debt Cleanup
Fix skipped tests and minor spec deviations. Low risk, incremental value.

## Consequences

### Positive
- All CI workflows green → unblocks deployment pipeline
- MCP research tool becomes functional end-to-end
- Rate limiting actually protects the API
- Type safety improvements reduce future bug surface
- Skipped tests re-enabled → higher confidence in changes

### Negative
- Phase 2 changes touch core pipeline paths — requires careful testing
- Rate limit enforcement may need graceful rollout to avoid breaking existing clients
- Embedding pipeline cron requires Vectorize binding configuration

### Neutral
- Duplicate `ExpiringDeal` interface renamed to `ExpiringDealRow` (D1) vs kept as `ExpiringDeal` (pipeline)
- Webhook unsubscribe changed from POST body to DELETE path parameter (matches spec)
- Empty catch blocks replaced with `console.warn` + structured logging

## Alternatives Considered

1. **Fix only CI, defer implementations** — Rejected: the missing implementations are core features that users expect
2. **Rewrite research pipeline** — Rejected: existing modules are well-structured, just need wiring
3. **Skip type safety cleanup** — Considered but rejected: the `as never` cast in semantic search is a runtime risk
