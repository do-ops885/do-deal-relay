# GOAP Swarm Execution Plan V5 — 2026-07-07

**Generated**: 2026-07-07
**Strategy**: Hybrid (Parallel implementation → Sequential validation)
**Source**: GOAP_STATE.md P3 actionable items + SYSTEM_REFERENCE.md audit
**Skills Used**: goap-agent, typescript-coding-standards, cloudflare
**Status**: ✅ COMPLETED

---

## Task Analysis

**Primary Goal**: Resolve remaining P3 actionable code fixes and update documentation
**Constraints**: Must pass typecheck, tests, and quality gates; no breaking changes
**Complexity**: Medium (3 code fixes + 1 doc update)

### Open Items Inventory (from P3 audit)

| ID | Item | Priority | Status | Effort | Actionable? |
|:---|:---|:---|:---|:---|:---|
| P3-5 | handleAnalytics rate limiting | 🟢 | MISSING | 15 min | Yes |
| P3-6 | handleMCPCall legacy rate limiting | 🟢 | PARTIAL | 15 min | Yes |
| P3-7 | handleDiscover synchronous pipeline | 🟢 | MISSING | 30 min | Yes |
| P3-10 | SYSTEM_REFERENCE.md outdated | 🟢 | PARTIAL | 20 min | Yes |
| P3-12 | tsconfig rootDir "." | 🟢 | NO-FIX | — | No (correct as-is) |

---

## Execution Plan

**Strategy**: Parallel (3 independent code fixes) → Sequential (validation + docs)

```
┌─────────────────────────────────────────────────────────────────┐
│                    GOAP Swarm Controller                        │
│  Strategy: Parallel Implementation → Sequential Validation      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Agent 1  │    │ Agent 2  │    │ Agent 3  │
    │ P3-5     │    │ P3-6     │    │ P3-7     │
    │ Rate     │    │ Rate     │    │ Async    │
    │ Limit    │    │ Limit    │    │ Pipeline │
    │ Analytics│    │ MCP Call │    │ Discover │
    └──────────┘    └──────────┘    └──────────┘
          │               │               │
          └───────────────┼───────────────┘
                          ▼
              ┌───────────────────────┐
              │  Typecheck + Format   │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Update SYSTEM_REF    │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Update GOAP_STATE    │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Git Commit + Push    │
              └───────────────────────┘
```

---

## Task Details

### Task 1: P3-5 — Add Rate Limiting to handleAnalytics (Agent: code-crafter)
- **File**: `worker/router.ts:259-263`
- **Change**: Wrap with `createRateLimitMiddleware` following the `/api/submit` pattern
- **Pattern**: `withAuth → createRateLimitMiddleware → handler`

### Task 2: P3-6 — Add Rate Limiting to Legacy handleMCPCall (Agent: code-crafter)
- **File**: `worker/router.ts:427-431`
- **Change**: Wrap with `createRateLimitMiddleware` following the NLQ pattern
- **Pattern**: `withAuth → createRateLimitMiddleware → handler`

### Task 3: P3-7 — Make handleDiscover Async (Agent: code-crafter)
- **Files**: `worker/index.ts`, `worker/router.ts`, `worker/routes/core/pipeline.ts`
- **Change**: Add `ExecutionContext` to fetch handler, use `ctx.waitUntil()` for pipeline execution
- **Pattern**: Return immediate 202 response, execute pipeline in background

### Task 4: P3-10 — Update SYSTEM_REFERENCE.md
- **File**: `agents-docs/SYSTEM_REFERENCE.md`
- **Change**: Add middleware pipeline, D1 database, continuous verification, DORA metrics sections

---

## Quality Gates

1. TypeScript compilation (`npx tsc --noEmit`)
2. Prettier formatting (`npx prettier --check`)
3. Existing tests pass (subset)
4. GOAP_STATE.md updated

## Acceptance Criteria

- [ ] P3-5: handleAnalytics has rate limiting
- [ ] P3-6: handleMCPCall legacy has rate limiting
- [ ] P3-7: handleDiscover returns immediately, pipeline runs async
- [ ] P3-10: SYSTEM_REFERENCE.md reflects current architecture
- [ ] All quality gates pass
- [ ] Changes committed and pushed

---

*GOAP Swarm V5 plan for resolving remaining P3 actionable items.*
