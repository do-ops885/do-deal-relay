# SPEC: AI Gateway Integration

**Goal**: Wire up Cloudflare AI Gateway for unified observability, cost tracking, and automatic failover for LLM-based features.

**Approach**: Create an AI Gateway client library and integrate it into existing MCP routes and future LLM endpoints.

**Non-Goals**:
- Implementing actual LLM inference (deferred to future work)
- Modifying existing deal processing pipeline
- Breaking changes to current API contracts

**Acceptance Criteria**:
1. AI Gateway client library in `worker/lib/ai-gateway/client.ts`
2. Gateway configuration in `worker/lib/ai-gateway/config.ts`
3. Integration with MCP tools/call route for observability
4. Unit tests for gateway client (mock fetch)
5. All CI gates pass (typecheck, lint, test, security)

**Open Questions**:
- Should we add a fallback to direct API calls if gateway is unavailable?
- What metrics should we track per request?

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Route / LLM Endpoint                                   │
│  ├─→ AI Gateway Client                                      │
│  │   ├─→ Request Logging (cost, latency, tokens)            │
│  │   ├─→ Cache Check (semantic cache)                       │
│  │   └─→ Failover to backup provider                        │
│  └─→ Response                                                │
└─────────────────────────────────────────────────────────────┘
```

## Files to Create/Modify

1. `worker/lib/ai-gateway/client.ts` — Gateway client
2. `worker/lib/ai-gateway/config.ts` — Configuration
3. `worker/lib/ai-gateway/types.ts` — TypeScript types
4. `worker/routes/mcp/tools-call.ts` — Integration point
5. `tests/unit/ai-gateway.test.ts` — Unit tests
