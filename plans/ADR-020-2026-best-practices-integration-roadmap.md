# ADR-020: 2026 Best Practices Integration Roadmap

**Status**: In Progress — Phase 1 URL health and guarded research scaffolding implemented; AI Gateway and Durable Execution deferred
**Created**: 2026-07-30
**Version**: 0.1.8
**Decision Maker**: do-deal-relay Platform Team
**Type**: Architecture & Strategy
**Supersedes**: Extends [ADR-015](ADR-015-harness-cloudflare-2026-best-practices.md)

---

## Context

A comprehensive GOAP swarm analysis was conducted on 2026-07-30, combining:
1. Full codebase audit against current state (v0.1.8)
2. Web research on 2026 Cloudflare Workers best practices
3. Web research on 2026 AI agent framework best practices
4. Cross-reference against April 2026 audit (50 items), swarm analysis (31 items), and feature gap analysis

Since the April audit, all P0-P3 items have been resolved, and significant architecture improvements have shipped (D1 dual-write, Vectorize, Durable Objects, centralized middleware, rate limiting, auth, file split compliance). However, fresh analysis reveals **16 new gaps** across 5 categories that represent the next phase of platform evolution.

This ADR prioritizes those gaps into an executable roadmap.

---

## Batch Implementation Status — 2026-07-31

This batch completed the safe, self-contained portions of the roadmap without enabling
uncontrolled external traffic or introducing a new runtime dependency:

- **GAP-FEAT-1 / NEW-FEAT-1 — Partial**: Real research remains opt-in through the
  `real_research_fetching` feature flag, request override, or explicit
  `RESEARCH_USE_REAL_FETCHING=true`. Fresh default flags are disabled; existing KV
  overrides remain operator-controlled. Source capability reporting now matches the
  same gate and checks per-source credentials accurately.
- **GAP-PLAT-1 / NEW-PLAT-1 — Implemented**: The daily `0 9 * * *` cron performs
  SSRF-safe HEAD checks with bounded concurrency, serialized per-domain pacing,
  transient failure flagging, and snapshot-validated production deactivation for
  definitive HTTP failures.
- **Skills workflow — Implemented**: CI validates canonical skills and checks
  `evals.json` freshness.
- **GAP-ARCH-2 / NEW-ARCH-2 — Deferred**: The reusable AI Gateway client and URL
  configuration already exist, but production LLM call sites use the native Workers
  AI binding and no provider credential contract is defined for gateway failover.
  Wiring this requires an explicit provider/auth decision and dedicated integration
  tests; this batch does not silently change the model path.
- **GAP-ARCH-1 / NEW-ARCH-1 — Deferred**: Durable Execution adoption remains a
  separately scoped runtime migration.
- **GAP-PLAT-2 / NEW-PLAT-2 — Implemented**: The public dashboard is now an
  installable PWA with a manifest, icons, a same-origin static-asset service worker,
  and Cloudflare Workers Static Assets configuration. API and deal data are not
  cached by the service worker.

## Decision: Adopt a 4-Phase Modernization Roadmap

### Phase 1 — Core Value Prop (Immediate: 1-2 weeks)

**Objective**: Enable the system's primary value proposition — autonomous deal discovery.

| ID | Action | Effort | Rationale |
|:---|:---|:---|:---|
| GAP-FEAT-1 | Enable guarded real web research behind feature flag | 3-5 days | Core value prop currently disabled; rollout remains operator-controlled |
| GAP-PLAT-1 | Implement URL health checking in daily cron | 1-2 days | ✅ Implemented in this batch with snapshot-safe deactivation |
| GAP-ARCH-1 | POC Durable Execution for pipeline | 2-3 days | Pipeline timeout resilience |

**Success Criteria**:
- Real discovery fetches from at least 3 sources (GitHub, ProductHunt, Reddit)
- Daily cron auto-deactivates deals with broken URLs
- Pipeline survives >30s execution time in POC

### Phase 2 — Architecture & AI Readiness (Short-term: 3-6 weeks)

**Objective**: Harden the architecture for production scale and improve AI agent interoperability.

| ID | Action | Effort | Rationale |
|:---|:---|:---|:---|
| GAP-FEAT-2 | User management & JWT auth system | 1-2 weeks | Enable personalization, reputation |
| GAP-ARCH-2 | AI Gateway integration for LLM calls | 2-3 days | Deferred pending provider/auth contract and call-site migration |
| GAP-AI-1 | Fix MCP version negotiation | 1 day | Spec compliance |
| GAP-FEAT-3 | SSE real-time deal updates via DO | 3-5 days | Reduce polling, enable live UIs |

**Success Criteria**:
- Users can register, login, and have JWT-authenticated sessions
- AI Gateway caches LLM responses, reducing costs
- MCP clients with incompatible versions get proper rejection
- New deals stream to subscribed clients within 5 seconds

### Phase 3 — Polish & Platform (Medium-term: 7-10 weeks)

**Objective**: Round out the user experience and operational maturity.

| ID | Action | Effort | Rationale |
|:---|:---|:---|:---|
| GAP-FEAT-5 | Enhanced web UI dashboard | 1-2 weeks | Accessibility for non-technical users |
| GAP-OBS-1 | DORA metrics tracking | 2-3 days | Engineering effectiveness |
| GAP-OBS-2 | Continuous Verification (Gate 10) | 3-5 days | Automated rollback on health degradation |
| GAP-AI-2 | A2A agent card + task delegation | 1 week | Multi-agent ecosystem participation |
| GAP-FEAT-4 | Deal ratings & feedback system | 3-5 days | Community validation |

**Success Criteria**:
- Web dashboard shows deal trends, top domains, and submission form
- DORA metrics endpoint tracks DF, LT, CFR, MTTR
- Gate 10 auto-rolls back if deal health degrades post-publication
- Agent card discoverable at `/.well-known/agent.json`

### Phase 4 — Maturity (Long-term: 11+ weeks)

**Objective**: Production hardening and platform expansion.

| ID | Action | Effort | Rationale |
|:---|:---|:---|:---|
| GAP-ARCH-3 | OTLP export destination configuration | 1 day | Distributed tracing in production |
| GAP-ARCH-4 | Build-once-promote-everywhere | 2-3 days | Eliminate artifact drift |
| GAP-AI-3 | NLQ documentation + MCP tools integration | 1-2 days | AI agent discoverability |
| GAP-PLAT-2 | PWA support for web UI | 3-5 days | Mobile accessibility |

---

## Architecture Decision: Durable Execution Adoption

### Decision
We will adopt Cloudflare Durable Execution (Fibers) for the pipeline state machine as the primary mechanism for handling long-running workflows.

### Rationale
- Workers have a 30s CPU hard limit. Discovery from 10+ sources with real HTTP requests risks timeout.
- Durable Execution checkpoints at every `await`, allowing automatic resumption across evictions.
- The existing state machine maps naturally to fiber checkpoints (discover → validate → dedupe → score → stage → publish).
- Zero idle cost — fibers only consume CPU during active execution.

### Alternatives Considered
- **Queues**: Would require restructuring the pipeline into discrete queue jobs. More invasive than fibers.
- **External orchestrator**: Running pipeline in a long-lived process outside Workers defeats the serverless model.
- **Batching**: Smaller discovery batches avoid timeout but reduce discovery throughput.

### Implementation
```typescript
// worker/state-machine.ts
import { runFiber } from '@cloudflare/agents';

export async function executePipeline(env: Env): Promise<PipelineResult> {
  return runFiber(async (fiber) => {
    await fiber.checkpoint('init');
    const ctx = await initializePipeline(env);

    await fiber.checkpoint('discover');
    const candidates = await discoverDeals(env, ctx);

    await fiber.checkpoint('validate');
    const validated = await validateDeals(env, ctx, candidates);
    // ... continues even across Worker eviction
  });
}
```

---

## Architecture Decision: Real Web Research Agent

### Decision
We will implement real web research behind a `REAL_RESEARCH_ENABLED` feature flag, rolling out one source at a time.

### Rationale
- The research agent framework is already built with simulation/real mode toggle.
- Gradual rollout minimizes risk of rate limiting and API cost surprises.
- Each source has different API requirements (OAuth, API keys, rate limits).

### Source Rollout Order
1. **GitHub API** (no auth needed for public repos, high referral code density)
2. **Hacker News API** (Algolia-powered, free, no auth)
3. **Reddit JSON API** (no auth for read, high deal discovery potential)
4. **ProductHunt** (requires API token, lower priority)
5. **Company site scraping** (generic HTML extraction, last due to fragility)

### Implementation
```typescript
// worker/lib/research/discovery-mode.ts
export function isRealResearchEnabled(env: Env): boolean {
  return env.REAL_RESEARCH_ENABLED === 'true';
}

// Per-source flag for gradual rollout
export function isSourceRealEnabled(env: Env, source: string): boolean {
  const enabled = env[`RESEARCH_${source.toUpperCase()}_REAL`];
  return enabled === 'true';
}
```

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|:---|:---|:---|:---|
| Real scraping hits external rate limits | Medium | High | Circuit breakers already in place; gradual source rollout; per-source rate limiting |
| Durable Execution API changes (beta) | Medium | Low | Wrap in abstraction layer; fallback to synchronous execution |
| User auth adds attack surface | Medium | Medium | Use established JWT patterns; rate limit auth endpoints; audit log |
| SSE connections consume DO resources | Low | Medium | Max connections per DO; idle timeout; hibernation API |
| AI Gateway costs exceed direct calls | Low | Low | Caching reduces costs; set budget alerts |

---

## Related Documents

- [GOAP Analysis 2026-07-30](GOAP-ANALYSIS-2026-07-30.md) — Full gap analysis (16 gaps)
- [ADR-015](ADR-015-harness-cloudflare-2026-best-practices.md) — Previous best practices ADR
- [ADR-016](ADR-016-centralized-middleware-architecture.md) — Middleware architecture
- [ADR-017](ADR-017-durable-objects-migration.md) — Durable Objects migration
- [GOAP_STATE.md](GOAP_STATE.md) — Current state inventory
- [Feature Gap Analysis](../reports/analysis/feature-gap-analysis.md) — Platform comparison

---

*ADR generated from GOAP swarm analysis combining codebase audit, Cloudflare Workers 2026 docs, and AI agent framework best practices research.*
