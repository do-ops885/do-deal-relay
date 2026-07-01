# GOAP Execution Master Plan: All Open Issues

**Date**: 2026-06-03
**Strategy**: Hybrid (Sequential → Parallel Swarm → Sequential → Parallel Swarm)
**Orchestrator**: GOAP Agent
**Total Issues**: 47 open (34 rollback + 13 feature)

---

## Task Analysis

**Primary Goal**: Resolve all open GitHub issues systematically
**Constraints**: Manual Cloudflare secret setup required for deployment
**Complexity**: Very Complex (4 phases, multiple agents, cross-cutting concerns)
**Quality Requirements**: All 13 quality gates pass, TypeScript strict mode, no regressions

---

## Issue Registry

### Already Implemented (Verify & Close)

| Issues | Feature | GOAP Plan |
|---|---|---|
| #280-#284 | User Management & Auth | GOAP-user-management-implementation.md |
| #290-#292 | MCP Pagination & Progress | GOAP-mcp-pagination-implementation.md |
| #294-#296 | Semantic Search | GOAP-semantic-search-implementation.md |

### To Implement

| Issues | Feature | Priority | Phase |
|---|---|---|---|
| #328-#403 | Rollback issues (batch close) | P0 | 1 |
| #242, #279 | Deployment readiness | P0 | 1 |
| #285 | Real web fetching default | P1 | 2 |
| #287 | AI content summarization | P2 | 2 |
| #288 | Rate limiting & caching | P2 | 2 |
| #277 | Monitoring & observability | P1 | 3 |
| #298 | Dashboard layout | P3 | 4 |
| #299 | Deal management views | P3 | 4 |
| #300 | Analytics dashboard views | P3 | 4 |
| #301 | Referral tracking interface | P3 | 4 |
| #302 | Web UI Dashboard epic | P3 | 4 |

---

## Phase 1: Deployment Unblock (Sequential)

**Strategy**: Sequential
**Duration**: ~5 minutes
**Quality Gate**: All rollback issues closed, runbook created

### Tasks
1. **T1.1**: Batch-close all 34 automated rollback issues with root cause explanation
   - Agent: general-purpose
   - Deps: none
   - Output: `gh issue close` commands

2. **T1.2**: Create deployment runbook documenting required manual steps
   - Agent: general-purpose
   - Deps: T1.1
   - Output: `docs/deployment-runbook.md`

3. **T1.3**: Verify #280-#284, #290-#292, #294-#296 are implemented and close with reference
   - Agent: general-purpose
   - Deps: none
   - Output: Issues closed with GOAP plan references

### Quality Gate - Phase 1
- [ ] All 34 rollback issues closed
- [ ] Deployment runbook exists
- [ ] Previously-implemented issues verified and closed

---

## Phase 2: Real Web Research Enhancement (Parallel Swarm)

**Strategy**: Parallel Swarm (3 agents)
**Duration**: ~15 minutes
**Quality Gate**: Integration tests pass, rate limits functional

### Tasks
1. **T2.1**: Implement rate limiting, caching, and request management (#288)
   - Agent: code-crafter
   - Deps: none
   - Files: `worker/lib/research-agent/request-manager.ts`, `worker/lib/research-agent/rate-limiter.ts`
   - Output: Per-domain rate limiting, KV caching, request deduplication

2. **T2.2**: Add AI-powered content summarization (#287)
   - Agent: code-crafter
   - Deps: none
   - Files: `worker/lib/research-agent/summarizer.ts`, new `worker/lib/research-agent/ai-summarizer.ts`
   - Output: LLM-based structured extraction with fallback

3. **T2.3**: Switch to real web fetching as default + integration tests (#285)
   - Agent: code-crafter
   - Deps: T2.1, T2.2
   - Files: `worker/lib/research-agent/fetcher.ts`, `worker/config.ts`
   - Output: `RESEARCH_USE_REAL_FETCHING=true` default, error handling, retry logic

### Quality Gate - Phase 2
- [ ] Rate limiting: 100 req/min per domain verified
- [ ] Caching: KV-based, >50% cache hit rate in tests
- [ ] AI summarization: Produces structured `ResearchSummary` output
- [ ] Real fetching: Works with timeout + retry + exponential backoff
- [ ] All unit tests pass
- [ ] TypeScript strict mode compiles

---

## Phase 3: Monitoring & Observability (Sequential)

**Strategy**: Sequential
**Duration**: ~10 minutes
**Quality Gate**: Health checks return dependency status, metrics exported

### Tasks
1. **T3.1**: Enhance health check endpoint with dependency status
   - Agent: code-crafter
   - Deps: none
   - Files: `worker/routes/core/health.ts`, `worker/routes/health.ts`
   - Output: D1, KV, research agent, MCP server status checks

2. **T3.2**: Add Prometheus-compatible metrics export
   - Agent: code-crafter
   - Deps: T3.1
   - Files: `worker/lib/metrics/index.ts`, `worker/routes/core/health.ts`
   - Output: `/metrics` endpoint with counters, histograms

3. **T3.3**: Create monitoring documentation with external service setup
   - Agent: general-purpose
   - Deps: T3.2
   - Files: `docs/monitoring-setup.md`
   - Output: Checkly/Pingdom setup guide, alerting rules

### Quality Gate - Phase 3
- [ ] `/health` returns all dependency statuses
- [ ] `/metrics` returns Prometheus-format metrics
- [ ] Documentation covers external monitoring setup
- [ ] Alerting thresholds documented

---

## Phase 4: Web UI Dashboard (Parallel Swarm)

**Strategy**: Parallel Swarm (3 agents)
**Duration**: ~20 minutes
**Quality Gate**: All views render, responsive design, no bundle bloat

### Tasks
1. **T4.1**: Design dashboard layout and component architecture (#298)
   - Agent: code-crafter
   - Deps: none
   - Files: `public/index.html`, `public/css/dashboard.css`, `public/js/app.js`
   - Output: Responsive layout with navigation, dark/light theme

2. **T4.2**: Implement deal management views (#299)
   - Agent: code-crafter
   - Deps: T4.1
   - Files: `public/js/deals.js`, `public/js/components/deal-card.js`
   - Output: Deal list, detail, search, filter views

3. **T4.3**: Implement analytics + referral tracking views (#300, #301)
   - Agent: code-crafter
   - Deps: T4.1
   - Files: `public/js/analytics.js`, `public/js/referrals.js`
   - Output: Analytics charts, referral management interface

### Quality Gate 4
- [ ] Dashboard loads at root URL
- [ ] Deal list view displays deals with pagination
- [ ] Deal detail view shows full deal information
- [ ] Analytics view shows charts/metrics
- [ ] Referral tracking view functional
- [ ] Responsive on mobile (375px) and desktop (1440px)
- [ ] Bundle size <100KB total

---

## Execution Timeline

```
Minute 0-5:    Phase 1 (Deployment Unblock)
Minute 5-20:   Phase 2 (Real Web Research - 3 parallel agents)
Minute 20-30:  Phase 3 (Monitoring & Observability)
Minute 30-50:  Phase 4 (Web UI Dashboard - 3 parallel agents)
Minute 50-55:  Final validation + quality gates
```

---

## Agent Assignments

| Phase | Agent Type | Count | Specialization |
|---|---|---|---|
| 1 | general-purpose | 1 | Issue management, documentation |
| 2 | code-crafter | 3 | TypeScript, Cloudflare Workers |
| 3 | code-crafter | 1 | Metrics, health checks |
| 4 | code-crafter | 3 | HTML/CSS/JS, responsive design |

---

## Error Handling

- **Agent Failure**: Retry once, then reassign to different agent type
- **Quality Gate Failure**: Run iterative-refinement skill to fix
- **Blocked Dependency**: Skip blocked task, continue with independent tasks
- **TypeScript Errors**: Run `npm run typecheck` and fix before proceeding

---

## Contingency Plans

- If Phase 1 manual steps cannot be completed: Skip deployment, focus on code changes
- If Phase 2 AI summarization fails: Fall back to rule-based extraction (existing)
- If Phase 4 bundle too large: Use lazy loading, split into multiple files
