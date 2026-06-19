# ADR-012: Master Implementation Strategy for All Open Issues

**Date**: 2026-06-03
**Status**: Accepted
**Issues**: #277, #279, #242, #280-#302 (all open non-rollback issues)

## Context

The do-deal-relay repository has 47 open GitHub issues:
- **34 automated rollback issues** (#328-#403): Root cause identified as missing Cloudflare secrets (`EMAIL_WEBHOOK_SECRET`, `API_ENCRYPTION_KEY`) that are now required by startup validation but were never configured.
- **13 feature/issues**: spanning deployment readiness, real web research, monitoring, MCP pagination, semantic search, user management, and web UI dashboard.

Several features are **already implemented** (per prior GOAP plans):
- User Management & Auth (#280-#284): Fully implemented (JWT, RBAC, refresh tokens, API keys)
- MCP Pagination & Progress (#290-#292): Fully implemented (cursor-based pagination, progress tracking)
- Semantic Search (#294-#296): Implemented (Vectorize + Workers AI embeddings)

### Remaining Work

| Issue Group | Issues | Priority | Status |
|---|---|---|---|
| Deployment Secrets | #242, #279 | P0 | Blocked (manual secret setup) |
| Rollback Batch Close | #328-#403 | P0 | Ready to close (root cause known) |
| Real Web Research | #285, #287, #288 | P1 | Partially implemented |
| Monitoring & Observability | #277 | P1 | Not started |
| Web UI Dashboard | #298-#302 | P3 | Not started |

## Decision

Execute a **4-phase Hybrid GOAP strategy** using a swarm of parallel agents:

### Phase 1: Deployment Unblock (Sequential)
- Close all 34 automated rollback issues (batch)
- Document required manual steps for Cloudflare secrets
- Create deployment runbook

### Phase 2: Real Web Research Enhancement (Parallel Swarm)
- **Agent A**: Rate limiting + caching + request management (#288)
- **Agent B**: AI-powered content summarization (#287)
- **Agent C**: Wire real fetching as default + testing (#285)
- Quality gate: Integration tests pass, rate limits verified

### Phase 3: Monitoring & Observability (Sequential)
- Health check endpoint improvements
- External monitoring documentation
- Metrics collection enhancement

### Phase 4: Web UI Dashboard (Parallel Swarm)
- **Agent A**: Dashboard layout + component architecture (#298)
- **Agent B**: Deal management views (#299)
- **Agent C**: Analytics/monitoring views (#300) + referral tracking (#301)
- Quality gate: All views functional, responsive design

## Consequences

### Positive
- Systematic resolution of all open issues
- Parallel execution reduces wall-clock time by 2-4x
- Each phase has clear quality gates
- Existing implementations reused (auth, MCP, search)

### Negative
- Phase 1 requires manual intervention (Cloudflare dashboard)
- Phase 2 requires Cloudflare AI Gateway for LLM summarization
- Phase 4 adds significant frontend code to a Worker-based project

### Risks
- **Deployment secrets**: Cannot be automated - requires manual Cloudflare dashboard access
- **AI summarization costs**: LLM API calls incur usage charges
- **Dashboard complexity**: Adding a full web UI to a Worker increases bundle size

## Architecture

```
Phase 1 (Sequential)          Phase 2 (Parallel Swarm)
┌─────────────────┐          ┌──────────────────────────┐
│ Close rollback  │          │ Agent A: Rate limiting   │
│ issues batch    │          │ Agent B: AI summarization│
│ Document secrets│          │ Agent C: Real fetching   │
│ Create runbook  │          └──────────────────────────┘
└────────┬────────┘                      │
         │                    Quality Gate: Tests pass
         ▼                               │
Phase 3 (Sequential)                     ▼
┌─────────────────┐          Phase 4 (Parallel Swarm)
│ Health checks   │          ┌──────────────────────────┐
│ Metrics enhance │          │ Agent A: Dashboard layout │
│ Monitoring docs │          │ Agent B: Deal views       │
└────────┬────────┘          │ Agent C: Analytics views  │
         │                   └──────────────────────────┘
         ▼                               │
    Final Validation ◄───────────────────┘
```

## Validation

- [ ] All 34 rollback issues closed with explanation
- [ ] Deployment runbook documented
- [ ] Rate limiting verified (100 req/min per domain)
- [ ] AI summarization produces structured output
- [ ] Real fetching works in production mode
- [ ] Health check endpoint returns dependency status
- [ ] Dashboard renders on mobile/desktop
- [ ] All quality gates pass (`./scripts/quality_gate.sh`)
