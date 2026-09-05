# GOAP Swarm Execution Plan — 2026-07-06

**Generated**: 2026-07-06
**Strategy**: Parallel (3 independent tasks)
**Source**: GOAP_STATE.md re-verification against current codebase

---

## Task Analysis

**Primary Goal**: Resolve remaining open items from GOAP_STATE.md
**Constraints**: Must pass typecheck, existing tests, and quality gates
**Complexity**: Medium (3 independent tasks, no cross-dependencies)

## Re-Verification Results

Many items in GOAP_STATE.md were already resolved but not marked:

| ID | Claimed Status | Actual Status | Evidence |
|:---|:---|:---|:---|
| P1-1 | 🔴 Open | ✅ Resolved | D1 routes use `withAuth(request, env, "admin", ...)` (router.ts:345) |
| P1-3 | 🔴 Open | ✅ Resolved | `/api/submit` uses `withAuth(request, env, "user", ...)` (router.ts:183) |
| P3-2 | 🟢 Open | ✅ Resolved | `handleReady` queries D1 directly, no JSON re-parsing (health.ts:23-24) |
| P3-3 | 🟢 Open | ✅ Resolved | Metrics counts `finalize` phase correctly (health.ts:179-181) |
| P3-4 | 🟢 Open | ✅ Resolved | `normalizeText` only strips control chars, preserves Unicode (normalize.ts:117) |
| P3-7 | 🟢 Open | ✅ Resolved | `handleDiscover` is admin-only, sync trigger is intentional |
| P3-8 | 🟢 Open | ✅ Resolved | User-Agent is `DealDiscoveryBot/1.0 (AI Agent; Autonomous Discovery)` |
| P3-9 | 🟢 Open | ✅ Resolved | `handleGetResearchResults` routed via `startsWith("/api/research/")` (router.ts:251) |
| P3-11 | 🟢 Open | ✅ Resolved | Only `wrangler.jsonc` exists, no `wrangler.toml` |
| P3-14 | 🟢 Open | ✅ Resolved | `paginate()` with cursor support in tools/list and resources/list |
| P3-15 | 🟢 Open | ✅ Resolved | `_meta.progressToken` handled in `handleToolCall` (tools.ts:64-79) |

## Truly Open Tasks (3)

### Task 1: P1-2 — Rate Limiting for Unprotected Endpoints (P1)
- **Priority**: P1 (Security)
- **Effort**: 1-2 hours
- **Agent**: code-crafter
- **Description**: Add rate limiting to endpoints that lack it: `/api/auth/register`, `/api/auth/login`, `/api/deals/*`, `/api/nlq`, `/api/experience`

### Task 2: P3-1 — Improve handleLive Health Check (P3)
- **Priority**: P3 (Polish)
- **Effort**: 30 min
- **Agent**: code-crafter
- **Description**: `handleLive` currently returns `{ alive: true }` unconditionally. Add lightweight KV connectivity check.

### Task 3: P3-10 — Fix Agent Docs Status (P3)
- **Priority**: P3 (Docs)
- **Effort**: 15 min
- **Agent**: code-crafter
- **Description**: 5 agent docs list status as "Pending" but agents are implemented and active. Update status.

---

## Execution Plan

**Strategy**: Parallel (all 3 tasks are independent)

```
┌─────────────────────────────────────────────────┐
│              GOAP Swarm Controller               │
│  Strategy: Parallel (3 independent agents)       │
└─────────────┬───────────────────────────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐
│Agent 1 │ │Agent 2 │ │Agent 3 │
│P1-2    │ │P3-1    │ │P3-10   │
│Rate    │ │Health  │ │Agent   │
│Limit   │ │Live    │ │Docs    │
└────────┘ └────────┘ └────────┘
    │         │         │
    └─────────┼─────────┘
              ▼
    ┌─────────────────┐
    │ Quality Gate     │
    │ (typecheck +     │
    │  tests)          │
    └─────────────────┘
```

## Quality Gates

1. TypeScript compilation (`npx tsc --noEmit`)
2. Existing tests pass (`npx vitest run`)
3. No lint regressions

## Acceptance Criteria

- [ ] P1-2: All non-health, non-admin-read endpoints have rate limiting
- [ ] P3-1: `handleLive` performs actual connectivity check
- [ ] P3-10: All agent docs show "Active" status
- [ ] GOAP_STATE.md updated with resolution status
- [ ] Typecheck passes
- [ ] Existing tests pass
