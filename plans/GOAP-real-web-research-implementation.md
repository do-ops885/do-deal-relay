# GOAP Plan: Real Web Research Enhancement (Issues #285, #287, #288)

**Date**: 2026-06-03
**Strategy**: Parallel Swarm → Sequential Integration
**Agents**: 3 code-crafter agents

## Context

The research agent (`worker/lib/research-agent/`) already supports real fetching when API keys are configured, but defaults to simulation. Issues #285, #287, #288 request:
1. Real fetching as default in production
2. AI-powered content summarization
3. Rate limiting, caching, and request management

## Architecture Decision: Request Management & AI Summarization

### ADR: Per-Domain Rate Limiting with Token Bucket

**Decision**: Use token bucket algorithm via existing `worker/lib/rate-limit.ts` pattern, extended for per-domain research rate limiting.

**Rationale**: The existing rate limiter uses KV-based token buckets. Research requires per-domain limits (different APIs have different quotas) rather than per-endpoint limits.

**Implementation**:
- Extend `ResearchRateLimiter` in `worker/lib/research-agent/rate-limiter.ts`
- Configurable limits per source (ProductHunt: 30/min, GitHub: 30/min, Reddit: 60/min)
- KV-backed for distributed coordination across workers

### ADR: AI Summarization with Fallback

**Decision**: Use Cloudflare Workers AI for structured extraction, with regex-based fallback.

**Rationale**: Workers AI (`@cf/meta/llama-3.1-8b-instruct`) is available on the platform. Fallback ensures functionality when AI is unavailable.

**Implementation**:
- New `AISummarizer` class in `worker/lib/research-agent/ai-summarizer.ts`
- Structured output: `{ deal_title, price, category, relevance_score, ... }`
- Token tracking for cost monitoring
- Graceful fallback to existing `Summarizer` class

---

## Task Decomposition

### Sub-Goals

1. **Rate Limiting & Caching** (#288) - Priority: P1, Deps: none
2. **AI Summarization** (#287) - Priority: P2, Deps: none
3. **Real Fetching Default** (#285) - Priority: P1, Deps: 1, 2

### Dependency Graph
```
T2.1 (Rate Limiting) ──────┐
                            ├──→ T2.3 (Real Fetching Default)
T2.2 (AI Summarization) ───┘
```

---

## Execution Plan

### Phase 2A: Parallel Implementation

**Agent 1 → T2.1: Rate Limiting & Caching (#288)**

Files to modify:
- `worker/lib/research-agent/rate-limiter.ts` - Per-domain token bucket
- `worker/lib/research-agent/request-manager.ts` - Request lifecycle
- `worker/lib/research-agent/index.ts` - Export new classes

Tasks:
1. Extend `ResearchRateLimiter` with per-domain config
2. Add KV-based response caching (TTL: 1h default)
3. Implement request deduplication for concurrent identical URLs
4. Add User-Agent rotation
5. Add bandwidth tracking metrics

Success Criteria:
- [ ] Per-domain rate limiting works (test: 100 req/min GitHub, 30/min ProductHunt)
- [ ] KV caching reduces duplicate requests by >50%
- [ ] Concurrent requests to same URL are deduplicated
- [ ] User-Agent rotates between requests

---

**Agent 2 → T2.2: AI Summarization (#287)**

Files to create/modify:
- `worker/lib/research-agent/ai-summarizer.ts` (new)
- `worker/lib/research-agent/summarizer.ts` - Add AI fallback path
- `worker/lib/research-agent/types.ts` - Add `ResearchSummary` interface

Tasks:
1. Create `AISummarizer` class with Workers AI integration
2. Define `ResearchSummary` interface (deal_title, price, category, etc.)
3. Add prompt template for deal extraction
4. Implement token usage tracking
5. Add fallback to regex-based extraction when AI unavailable
6. Add quality metrics (extraction accuracy scoring)

Success Criteria:
- [ ] AI summarization produces structured `ResearchSummary` output
- [ ] Token usage tracked and logged
- [ ] Fallback works when AI endpoint unavailable
- [ ] Output validated against Zod schema

---

### Phase 2B: Integration (Sequential)

**Agent 3 → T2.3: Real Fetching Default (#285)**

Dependencies: T2.1 and T2.2 must complete first.

Files to modify:
- `worker/config.ts` - Default `RESEARCH_USE_REAL_FETCHING=true`
- `worker/lib/research-agent/fetcher.ts` - Wire in rate limiter + cache + AI summarizer
- `worker/lib/research-agent/orchestrator.ts` - Update pipeline to use new components

Tasks:
1. Change default config to enable real fetching
2. Wire rate limiter into fetch pipeline
3. Wire cache layer before HTTP requests
4. Wire AI summarizer after content extraction
5. Add retry logic with exponential backoff (3 attempts, 1s/2s/4s)
6. Add timeout handling (10s default)
7. Update error handling for real HTTP failures

Success Criteria:
- [ ] `RESEARCH_USE_REAL_FETCHING` defaults to `true`
- [ ] Real fetching works end-to-end
- [ ] Rate limits enforced per domain
- [ ] Cache hits reduce actual HTTP requests
- [ ] AI summarization produces structured output
- [ ] Retries work with exponential backoff
- [ ] Timeouts handled gracefully

---

## Quality Gate: Phase 2 Complete

- [ ] All unit tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Rate limiting verified (100 req/min per domain)
- [ ] Caching reduces duplicate requests >50%
- [ ] AI summarization produces valid `ResearchSummary`
- [ ] Real fetching works with error handling
- [ ] No regressions in existing research agent tests

## Contingency

- If Workers AI unavailable: Use rule-based extraction (existing `Summarizer`)
- If KV caching adds too much latency: Use in-memory cache with shorter TTL
- If rate limiting blocks legitimate requests: Add burst allowance (10 extra req/min)
