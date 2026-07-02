# ADR-015: 2026 Harness Engineering & Cloudflare Architecture Best Practices Adoption

**Status**: Proposed
**Created**: 2026-07-02
**Version**: 0.1.8
**Decision Maker**: do-deal-relay Platform Team
**Type**: Architecture & Process

---

## Context

The do-deal-relay system is a Cloudflare Workers-based autonomous deal discovery platform. As of mid-2026, both the CI/CD landscape (Harness platform) and the Cloudflare ecosystem (Agents SDK, Durable Objects, Durable Execution) have evolved significantly. This ADR maps the latest 2026 best practices to our codebase and proposes concrete adoption steps.

---

## Decision Drivers

1. **CI/CD Modernization**: The project uses GitHub Actions extensively. Harness 2026 patterns (templates, OPA/Rego policies, progressive delivery) can improve pipeline reliability and governance.
2. **Cloudflare Architecture Evolution**: The Agentic Cloud paradigm (Agents SDK, Durable Objects with SQLite, Durable Execution) aligns with our multi-agent autonomous discovery model.
3. **Code Quality & Standards**: The existing AGENTS.md and harness engineering principles (iterate on failure, progressive disclosure, context hygiene) remain valid but need augmentation.
4. **Security & Compliance**: EU AI Act logging exists but needs maturity; D1 endpoints lack authentication; rate limiting infrastructure exists but is not applied.

---

## Harness Engineering Best Practices (Internal "Coding Harness")

Our internal "harness" concept (AGENTS.md + agents-docs/ + skills + sub-agents + hooks + back-pressure) maps cleanly to the 2026 Harness CI/CD platform patterns:

| Our Harness Concept | 2026 Harness Platform Equivalent | Status |
|:---|:---|:---|
| `AGENTS.md` constraints | Pipeline Templates (standardized stages) | ✅ Implemented |
| `agents-docs/` progressive disclosure | Git-backed versioned YAML templates | ✅ Implemented |
| Quality gates (`quality_gate.sh`) | OPA/Rego policies "On Save" / "On Run" | ✅ Implemented |
| State machine pipeline (9 gates) | Progressive deployment with auto-rollback | ✅ Implemented |
| `LEARNINGS.md` post-mortems | DORA metrics tracking (DF, LT, CFR, MTTR) | ⚠️ Partial |
| Skills architecture | Test Intelligence (impact-based execution) | ✅ Implemented |
| Context hygiene & back-pressure | Resource limits & concurrency control | ✅ Implemented |
| Sub-agent delegation | Facets / child agent spawning | ✅ Implemented |

### Recommended Enhancements

#### H-1: Continuous Verification (CV) Metrics
**Problem**: The 9-gate pipeline validates deals but there's no post-publication health monitoring with automatic rollback.

**Proposal**: Add a 10th gate — `continuous_verification`:
```typescript
// New: worker/pipeline/validate.ts
// Gate 10: Post-publication health monitoring
async function gateContinuousVerification(
  env: Env,
  ctx: PipelineContext
): Promise<GateResult> {
  // Check deal health metrics over time window
  const metrics = await getDealHealthMetrics(env, ctx.run_id);
  
  if (metrics.successRate < 0.5 || metrics.complaintRate > 0.1) {
    return { passed: false, reason: "Post-publication health degraded" };
  }
  
  return { passed: true };
}
```

#### H-2: DORA Metrics Dashboard
**Problem**: No systematic tracking of deployment frequency, lead time, change failure rate, or MTTR.

**Proposal**: Add `worker/lib/metrics/dora.ts` to track:
- `deployment_frequency`: deploys per week
- `lead_time_for_changes`: time from commit to deploy
- `change_failure_rate`: % of deploys that rollback
- `mttr`: mean time to recover from failure

Publish as a `/api/metrics/dora` endpoint and integrate with the existing `worker/lib/metrics/` module.

#### H-3: Build-Once-Promote-Everywhere
**Problem**: The build script regenerates version info on every deploy, potentially creating drift between staging and production artifacts.

**Proposal**: Generate build artifacts once, store in R2, and promote the same artifact across environments:
```typescript
// Deployment pipeline should:
// 1. Build once → store in R2 bucket
// 2. Deploy staging → verify health
// 3. Deploy production ← same artifact, no rebuild
```

---

## Cloudflare 2026 Architecture Best Practices

### Current Architecture Assessment

| Component | Current (v0.1.8) | 2026 Recommended | Gap |
|:---|:---|:---|:---|
| **Compute** | Cloudflare Workers (V8 isolates) | Workers + Durable Objects for stateful agents | No DOs used |
| **State** | KV (5 namespaces) + D1 | DO SQLite per-agent for persistence | KV-only for core state |
| **Memory** | None (stateless) | Agent Memory service | Not integrated |
| **Orchestration** | State machine (in-process) | Agents SDK `Think` base class | Custom implementation |
| **Execution** | Synchronous (30s limit) | Durable Execution (Fibers) | No checkpointing |
| **AI Gateway** | Not used | AI Gateway for unified inference | Not integrated |
| **Code Generation** | Not used | `@cloudflare/codemode` for single-program tasks | Not applicable yet |
| **Security** | Zod validation + HMAC | Dynamic Workers with scoped bindings | ✅ Good |
| **Sub-agents** | Manual spawning | Durable Object Facets (typed RPC) | Custom handoff protocol |

### Priority Migrations

#### C-1: Durable Objects for Core State (HIGH PRIORITY)
**Rationale**: KV's eventual consistency causes race conditions (documented in KNOWN_ISSUES.md CANTFIX-001). Durable Objects provide strong consistency, atomic operations, and zero-idle-cost hibernation.

**Migration Path**:
```typescript
// New: worker/durable-objects/deal-registry.ts
export class DealRegistry extends DurableObject {
  private deals: Map<string, Deal>;
  
  async stageDeal(deal: Deal): Promise<void> {
    // Atomic write with strong consistency
    this.deals.set(deal.id, deal);
  }
  
  async publishDeals(dealIds: string[]): Promise<void> {
    // Atomic batch promotion
    for (const id of dealIds) {
      const deal = this.deals.get(id);
      if (deal) deal.status = 'published';
    }
  }
}
```

**Benefits**:
- Eliminates lock race condition (C-4 from audit)
- True atomic operations without CAS workarounds
- Colocate compute + state for lower latency

#### C-2: Durable Execution for Long-Running Pipelines (MEDIUM PRIORITY)
**Rationale**: The pipeline currently executes synchronously within the 30s Workers CPU limit. Durable Execution (Fibers) allows checkpointing and resumption across timeouts.

**Migration Path**:
```typescript
// Enhanced: worker/state-machine.ts
import { runFiber } from '@cloudflare/agents';

async function executePipeline(env: Env): Promise<PipelineResult> {
  return runFiber(async (fiber) => {
    // Each phase checkpoints automatically
    await fiber.checkpoint('init');
    const ctx = await initializePipeline(env);
    
    await fiber.checkpoint('discover');
    const deals = await discoverDeals(env, ctx);
    
    await fiber.checkpoint('validate');
    const validated = await validateDeals(env, ctx, deals);
    
    // ... continues even across Worker eviction
    await fiber.checkpoint('publish');
    return await publishDeals(env, ctx, validated);
  });
}
```

**Benefits**:
- Pipelines can run >30s without timeout
- Automatic retry on eviction
- No need to pipeline within a single request

#### C-3: Agent Memory for Conversational State (LOW PRIORITY)
**Rationale**: The NLQ (Natural Language Query) system and Telegram/Discord bots could benefit from persistent conversation memory.

**Proposal**: Integrate Agent Memory for bot conversations:
```typescript
// Enhanced: worker/lib/bot/conversation.ts
import { AgentMemory } from '@cloudflare/agents';

const memory = new AgentMemory({
  sections: ['soul', 'important_facts', 'recent_deals'],
});

await memory.update('recent_deals', {
  lastQuery: 'trading platform deals',
  lastResults: dealIds,
  timestamp: Date.now(),
});
```

#### C-4: AI Gateway Integration (MEDIUM PRIORITY)
**Rationale**: If/when LLM-based extraction or deal analysis is added, route through AI Gateway for unified observability, cost tracking, and automatic failover.

**Proposal**: Add AI Gateway binding to `wrangler.jsonc`:
```jsonc
{
  "ai_gateway": {
    "binding": "AI_GATEWAY",
    "id": "deal-relay-gateway"
  }
}
```

---

## Code Quality Enhancements

### From the April 2026 Audit — Priority Resolution Order

The April audit identified **50 issues** (4 critical, 8 high, 20 medium, 18 low). Based on impact analysis, the priority order for resolution is:

#### Immediate (P0) — Fix Broken Functionality
1. **H-8 (CRON MISMATCH)**: Align cron patterns between `wrangler.jsonc` and `state-machine.ts` — daily expiry and weekly validation never run
2. **C-1 (SUCCESS NOTIFICATION)**: Fix `type: "system_error"` for successful completions
3. **M-9 (DISCOVERY URLs)**: Fix glob patterns in discovery URL construction
4. **SWARM-CRITICAL-1 (DEACTIVATE ROUTE)**: Fix regex for deactivate route

#### High (P1) — Security & Stability
5. **H-3 (D1 AUTH)**: Add authentication to D1 endpoints
6. **M-8 (RATE LIMITING)**: Apply rate limiting to all API endpoints
7. **C-4 (LOCK RACE)**: Mitigate KV lock race condition
8. **H-6 (TRUST EVOLUTION)**: Implement `evolveSourceTrust` function
9. **M-11 (SNAPSHOT HASH)**: Make Gate 9 meaningful

#### Medium (P2) — Code Quality & Coverage
10. **M-1 through M-6 (FILE SIZE)**: Split files exceeding 500-line limit
11. **M-13 through M-15 (TESTS)**: Add tests for referral storage, D1 routes, and email
12. **M-7 (SUBMIT AUTH)**: Add auth to `/api/submit`

#### Low (P3) — Polish
13. Remaining low-priority items from the audit

### Integration Gaps (from Feature Gap Analysis)

| Feature | Original Priority | April 2026 Status | July 2026 Status |
|:---|:---|:---|:---|
| Real Web Research Agent | HIGH | Simulated only | ⚠️ Still simulated |
| D1 Database Integration | HIGH | Partial | ✅ Implemented (dual-write) |
| User Management & Auth | MEDIUM | Not started | ❌ Not implemented |
| MCP Server for AI Integration | MEDIUM | Implemented | ✅ 85% complete |
| Deal Expiration Automation | MEDIUM | Basic only | ⚠️ Cron mismatch blocks it |
| Vector Search (Semantic) | LOW (P3) | Not started | ✅ Implemented (P3 follow-up) |
| Web UI Dashboard | LOW (P3) | Not started | ❌ Not started |

---

## Coding Workflow with Harness Engineering

### Updated Development Workflow

Based on 2026 best practices, the GOAP development cycle is refined:

```
┌─────────────────────────────────────────────────────┐
│  1. ANALYZE & STRATEGIZE (Phase 1)                  │
│  ├─ Deep Analysis of repo + infrastructure          │
│  ├─ TRIZ/ADR for complex logic                      │
│  ├─ CI Status check (./scripts/check-ci-status.sh)  │
│  └─ OPA-style Policy Check (quality_gate.sh)        │
├─────────────────────────────────────────────────────┤
│  2. DECOMPOSE & PLAN (Phase 2)                      │
│  ├─ Deep Planning Mode                              │
│  ├─ GOAP: Atomic tasks in GOAP_STATE.md             │
│  ├─ Template-based task decomposition               │
│  └─ Impact-based test selection (Test Intelligence)  │
├─────────────────────────────────────────────────────┤
│  3. EXECUTE & COORDINATE (Phase 3)                  │
│  ├─ Atomic commits with conventional format         │
│  ├─ Quality Gate after every change                 │
│  ├─ Always-Fix pre-existing issues                  │
│  ├─ Progressive deployment (staging → production)   │
│  └─ Continuous Verification metrics                 │
├─────────────────────────────────────────────────────┤
│  4. SYNTHESIZE (Phase 4)                            │
│  ├─ Update README.md, docs/, agents-docs/           │
│  ├─ Extract learnings → LEARNINGS.md                │
│  ├─ Update DORA metrics                             │
│  ├─ Post-task metrics → .agents/metrics.jsonl       │
│  └─ Archive completed plans                         │
└─────────────────────────────────────────────────────┘
```

### Harness Engineering Commandments (Updated)

1. **Iterate on Failure**: Add configuration only when the agent fails. Throw away what doesn't help.
2. **Progressive Disclosure**: AGENTS.md < 150 lines; detailed docs in agents-docs/.
3. **Single Canonical Source**: Skills in `.agents/skills/` with symlinks.
4. **Prefer CLI over MCP**: Well-known CLIs (GitHub, Docker) over verbose MCP responses.
5. **Context Hygiene**: Swallow passing output; surface failures only.
6. **Build Once, Promote Everywhere**: Never rebuild between staging and production.
7. **Shift-Left Security**: SAST, SCA, secret scanning in CI pipeline.
8. **Continuous Verification**: Monitor post-deployment health; auto-rollback if degraded.
9. **Always-Fix**: Zero tolerance for regressive or inherited failures.
10. **Atomic & Conventional**: Every commit is atomic; messages follow `type(scope): subject`.

---

## Resource Allocation

### Proposed Timeline

| Phase | Timeline | Focus | Effort |
|:---|:---|:---|:---|
| **Phase 1: Critical Fixes** | Week 1-2 | Fix cron, notification, deactivate route, discovery URLs | 1-2 days each |
| **Phase 2: Security Hardening** | Week 3-4 | D1 auth, rate limiting, lock mitigation, trust evolution | 2-3 days each |
| **Phase 3: Architecture Modernization** | Week 5-8 | Durable Objects migration, Durable Execution for pipelines | 1-2 weeks each |
| **Phase 4: Real Research Agent** | Week 9-11 | Real web scraping with API integrations | 2-3 weeks |
| **Phase 5: Polish & Cover** | Week 12+ | Test coverage, file splits, remaining issues | Ongoing |

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|:---|:---|:---|:---|
| Durable Objects increase cold start latency | Medium | Medium | Benchmark; keep KV cache as hot path |
| D1 beta status changes break dual-write | Medium | Low | Feature flags for D1; KV always primary |
| Real web scraping hits rate limits | Medium | High | Circuit breakers already in place; gradual rollout |
| Agent Memory service availability | Low | Low | Fallback to stateless mode |

---

## Success Metrics

| Metric | Current | Target | Timeline |
|:---|:---|:---|:---|
| CI pass rate | ~80% (vitest crash) | 100% | Phase 1 |
| Cron jobs firing correctly | 0/3 | 3/3 | Phase 1 |
| API endpoint auth coverage | 0% | 100% for sensitive | Phase 2 |
| File size compliance (<500 lines) | 88% | 100% | Phase 3 |
| Test coverage ratio | 1:5.2 | 1:2.0 | Phase 5 |
| Discovery autonomy | 0% real | 80% real | Phase 4 |

---

## Related Documents

- [agents-docs/HARNESS.md](../agents-docs/HARNESS.md) — Internal harness engineering principles
- [agents-docs/SYSTEM_REFERENCE.md](../agents-docs/SYSTEM_REFERENCE.md) — Architecture reference
- [reports/analysis/codebase-audit-2026-04-04.md](../reports/analysis/codebase-audit-2026-04-04.md) — April 2026 audit (50 issues)
- [reports/analysis/feature-gap-analysis.md](../reports/analysis/feature-gap-analysis.md) — Feature gaps vs modern platforms
- [reports/analysis/swarm-missing-implementations-2026-04-04.md](../reports/analysis/swarm-missing-implementations-2026-04-04.md) — Swarm analysis of missing implementations
- [plans/FOLLOWUP-p3-features.md](FOLLOWUP-p3-features.md) — P3 follow-up features
- [plans/FOLLOWUP-deployment-fix.md](FOLLOWUP-deployment-fix.md) — Deployment hardening
- [plans/github-automation-plan.md](github-automation-plan.md) — GitHub automation status
- [agents-docs/KNOWN_ISSUES.md](../agents-docs/KNOWN_ISSUES.md) — Permanent infrastructure constraints

---

*ADR generated from codebase analysis, web research on Harness 2026 CI/CD patterns, and Cloudflare Agents Week 2026 announcements.*
