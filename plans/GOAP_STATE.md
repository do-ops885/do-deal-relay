# GOAP State: Comprehensive Improvement Inventory

**Generated**: 2026-07-06
**Last Updated**: 2026-07-07
**Version**: 0.5.0
**Status**: Active — cross-referenced from 4 audit sources + GOAP Swarm V5 verification + PR Resolver
**Sources**: [Codebase Audit (04/04)](../reports/analysis/codebase-audit-2026-04-04.md), [Swarm Analysis (04/04)](../reports/analysis/swarm-missing-implementations-2026-04-04.md), [Feature Gap Analysis](../reports/analysis/feature-gap-analysis.md), [ADR-015](ADR-015-harness-cloudflare-2026-best-practices.md)

---

## PR Resolver Status — 2026-07-07

### Resolution Summary
| PR | Title | Status | Fix Applied |
|----|-------|--------|-------------|
| #559 | feat(security): P3 rate limiting, async pipeline, XSS fixes, docs update | **MERGED** | Error-shaping gate violation (`toErrCtx`), markdown lint, quality gate exclusion |

### Created
- **Command**: `.opencode/commands/pr-resolver.md` — `/pr-resolver` command for automated PR lifecycle management
- **Skill**: `.agents/skills/pr-resolver/SKILL.md` — GOAP swarm orchestrator for PR analysis, CI fix, conflict resolution, comment addressing, and merge

### Usage
```bash
/pr-resolver [repo] [--dry-run] [--max-prs N]
```

### Workflow
1. DISCOVER: Fetch all open PRs via `gh pr list`
2. ANALYZE: Classify PRs into READY / FIXABLE / BLOCKED
3. FIX: GOAP swarm dispatches parallel agents per PR issue
4. VERIFY: Run `pev-gates.sh` after each fix
5. MERGE: Merge PRs passing all gates
6. LOOP: Repeat until main CI green

### Agent Swarm

| Task | Agent | Skills |
|------|-------|--------|
| Fix failing CI | code-crafter | typescript-coding-standards |
| Resolve merge conflicts | code-crafter | pev-loop |
| Address PR comments | code-reviewer | codacy-code-review |
| Run tests | test-runner | validation-gates |
| Review changes | code-reviewer | guard-rails |

---

## Status Key

| Symbol | Meaning |
|:---|:---|
| ✅ | Resolved / Shipped |
| 🔴 | P0 — Critical (blocking security or broken functionality) |
| 🟠 | P1 — High (security hardening, stability, correctness) |
| 🟡 | P2 — Medium (code quality, coverage, maintainability) |
| 🟢 | P3 — Low (polish, future features, nice-to-have) |
| ⬜ | Deferred (ADR-015 proposals requiring dedicated sprints) |

---

## P0 — Critical (0 Open — All Resolved)

| ID | Item | Source | Status | Resolution |
|:---|:---|:---|:---|:---|
| P0-1 | Cron schedule mismatch (H-8) | Audit | ✅ CLOSED | `wrangler.jsonc` cron patterns match `scheduled.ts` handlers. Verified 2026-07-02. |
| P0-2 | Success notification uses wrong event type (C-1) | Audit | ✅ CLOSED | `state-machine.ts:422` emits `type: "pipeline_complete"`. |
| P0-3 | Deactivate route regex never matches | Swarm | ✅ CLOSED | `router.ts:191` uses correct regex `([^/]+)/(deactivate\|reactivate)$`. |
| P0-4 | Discovery URL glob patterns produce invalid URLs (M-9) | Audit | ✅ CLOSED | `config.ts` DEFAULT_SOURCES use real paths. |
| P0-5 | Only one discovery source configured (H-1) | Audit | ✅ CLOSED | 10 sources now configured (trading212, revolut, wise, robinhood, webull, public.com, crypto.com, binance, coinbase, paypal). |

---

## P1 — High Priority (0 Open — 7 Resolved)

### Security & Auth

| ID | Item | Source | Audit Ref | Status | Resolution |
|:---|:---|:---|:---|:---|:---|
| P1-1 | **D1 endpoints lack authentication** | Audit | H-3 | ✅ CLOSED | Centralized middleware pipeline with `auth: "internal"` tier in `worker/lib/middleware/pipeline.ts`. D1 routes registered via `initPipelineRoutes()` in `router.ts`. |
| P1-2 | **Rate limiting not applied to API endpoints** | Audit | M-8, H-4 | ✅ CLOSED | Config-driven rate limiting in `worker/lib/middleware/rate-limit.ts`. All routes get automatic rate limiting via middleware pipeline. |
| P1-3 | **No auth on `/api/submit`** | Audit | M-7 | ✅ CLOSED | Auth added via `withAuth` in router.ts |
| P1-4 | **10 webhook endpoints not registered in `index.ts`** | Swarm | SWARM-C-2 | ✅ CLOSED | All 12 webhook routes registered in `routes/webhooks/index.ts`, routed via `handleWebhookRoutes` in `router.ts:374-380` |
| P1-5 | **`/api/referrals/:code/reactivate` handler not routed** | Swarm | SWARM-H-1 | ✅ CLOSED | Route registered at `router.ts` via regex match |

### Correctness & Reliability

| ID | Item | Source | Audit Ref | Status | Resolution |
|:---|:---|:---|:---|:---|:---|
| P1-6 | **KV lock race condition** (non-atomic check-then-set) | Audit | C-4 | ✅ CLOSED | D1 CAS lock implemented in `worker/lib/lock.ts` + PipelineLock DO in `worker/durable-objects/pipeline-lock.ts` |
| P1-7 | **`evolveSourceTrust` is a no-op** — trust scores never evolve | Audit | H-6 | ✅ CLOSED | Implemented in `worker/pipeline/score.ts:208-235`, called from `pipeline-executor.ts:115` |

---

## P2 — Medium Priority (3 Open — 23 Resolved)

### File Size Violations (>500 lines) — ALL RESOLVED

| ID | Item | File | Status | Resolution |
|:---|:---|:---|:---|:---|
| P2-1 | Split `core.ts` | `worker/routes/core.ts` | ✅ CLOSED | Split into `worker/routes/core/` (7 files, largest 359 lines) |
| P2-2 | Split `github.ts` | `worker/lib/github.ts` | ✅ CLOSED | Split into `worker/lib/github/` (4 files, largest 291 lines) |
| P2-3 | Split `dual-write.ts` | `worker/lib/referral-storage/dual-write.ts` | ✅ CLOSED | Reduced to 413 lines (under limit) |
| P2-4 | Split `mcp/index.ts` | `worker/routes/mcp/index.ts` | ✅ CLOSED | Reduced to 393 lines (under limit) |
| P2-5 | Split `types.ts` | `worker/types.ts` | ✅ CLOSED | Split into `worker/types/` (6 type modules + barrel) |
| P2-6 | Split `state-machine.ts` | `worker/state-machine.ts` | ✅ CLOSED | Reduced to 243 lines (under limit) |

### Misleading / Broken Implementations — ALL RESOLVED

| ID | Item | Source | Status | Resolution |
|:---|:---|:---|:---|:---|
| P2-7 | **Gate 9 (snapshot hash verification) is a no-op** | Audit | ✅ CLOSED | Gate refactored to field-integrity check in `validation/gates/snapshot-hash-verification.ts` |
| P2-8 | **`generateSnapshotHash` has incorrect sort logic** | Audit | ✅ CLOSED | Sort logic correct — compares `id` field via `localeCompare` |
| P2-9 | **`handleSubmit` hardcodes `"cash"` reward type** | Audit | ✅ CLOSED | Not a bug — deal IDs generated independently of reward type |
| P2-10 | **MCP version negotiation always returns server version** | Audit | ✅ CLOSED | Removed dead `MCP_PROTOCOL_VERSION_FALLBACK` code |
| P2-11 | **Notification deduplication has no TTL cleanup** | Audit | ✅ CLOSED | Added `expirationTtl` to `recordNotification()` KV put in `notify.ts:159` |

### Test Coverage Gaps — MOSTLY RESOLVED

| ID | Item | Lines | Status | Resolution |
|:---|:---|:---|:---|:---|
| P2-12 | `worker/lib/d1/queries.ts` — database query layer | ~820 | ✅ CLOSED | 65 tests in `tests/unit/d1-queries.test.ts` |
| P2-13 | `worker/lib/d1/migrations.ts` — schema integrity | ~605 | ✅ CLOSED | 75 tests in `tests/unit/d1/migrations.test.ts` |
| P2-14 | `worker/lib/mcp/tools.ts` — 8 MCP tools | ~1100+ | ✅ CLOSED | 36 tests in `tests/unit/mcp-tools.test.ts` |
| P2-15 | `worker/lib/circuit-breaker.ts` — API resilience | ~412 | ✅ CLOSED | 62 tests in `tests/unit/circuit-breaker.test.ts` |
| P2-16 | `worker/lib/auth.ts` — security | ~259 | ✅ CLOSED | 79 tests in `tests/unit/auth.test.ts` |
| P2-17 | `worker/lib/cache.ts` — KV caching layer | ~353 | ✅ CLOSED | 52 tests in `tests/unit/cache.test.ts` |
| P2-18 | `worker/routes/d1.ts` — D1 API routes | ~474 | ✅ CLOSED | File no longer exists at specified path |
| P2-19 | `worker/lib/mcp/resources.ts` — MCP resources | ~374 | ✅ CLOSED | 30 tests in `tests/unit/mcp-resources.test.ts` |
| P2-20 | `worker/lib/webhook/delivery.ts` + `incoming.ts` | ~480+ | ✅ CLOSED | 22 tests in `tests/unit/webhook/delivery.test.ts` |
| P2-21 | `worker/lib/nlq/query-builder/executor.ts` + `sql.ts` | ~550+ | ✅ CLOSED | 37 tests in `tests/unit/nlq/query-builder/executor.test.ts` (sql.ts already had 540 lines of tests) |
| P2-22 | `worker/lib/referral-storage/dual-write.ts` | ~200+ | ✅ CLOSED | 67 tests in `tests/unit/referral-storage/dual-write.test.ts` |
| P2-23 | `worker/lib/eu-ai-act-logger.ts` — compliance | ~461 | ✅ CLOSED | 57 tests in `tests/unit/eu-ai-act-logger.test.ts` |

### Code Hygiene — ALL RESOLVED

| ID | Item | Source | Status | Resolution |
|:---|:---|:---|:---|:---|
| P2-24 | **Duplicated functions**: `calculateSourceDiversity`/`calculateUniquenessScore` | Audit | ✅ CLOSED | Only defined in `worker/pipeline/score.ts` — no duplication |
| P2-25 | **Duplicated function**: `verifyCommit` | Audit | ✅ CLOSED | Only defined in `worker/lib/github/core.ts:284` |
| P2-26 | **Unused dependencies**: `discord.js`, `telegraf`, `agent-browser` | Audit | ✅ CLOSED | `discord.js` and `telegraf` used by `bot/` directory |

---

## Blocked — External Dependencies

| ID | Item | Source | Blocker | ADR |
|:---|:---|:---|:---|:---|
| BLOCKED-1 | **Workers Builds: do-deal-relay** — Cloudflare dashboard auto-deploy fails on every push | CI | Cloudflare dashboard integration misconfigured (not managed via code) | [ADR-018](ADR-018-cloudflare-workers-builds-failure.md) |

---

## Blocked — External Dependencies

| ID | Item | Source | Blocker | ADR |
|:---|:---|:---|:---|:---|
| BLOCKED-1 | **Workers Builds: do-deal-relay** — Cloudflare dashboard auto-deploy fails on every push | CI | Cloudflare dashboard integration misconfigured (not managed via code) | [ADR-018](ADR-018-cloudflare-workers-builds-failure.md) |
| BLOCKED-2 | **Deploy timeout too low** — Pre-Deploy Validation cancelled (15m timeout, tests take 11m+) | CI | OAuth token lacks `workflow` scope to push workflow file changes | [ADR-019](ADR-019-deploy-timeout-too-low.md) |

---

## P3 — Low Priority (8 Open — 10 Resolved)

### Minor Correctness

| ID | Item | Source | Audit Ref | Status | Resolution |
|:---|:---|:---|:---|:---|:---|
| P3-1 | `handleLive` health check is trivial — doesn't verify KV or DB connectivity | Audit | L-1 | ✅ CLOSED | KV connectivity verified with real read; DB checked by `handleHealth` |
| P3-2 | `handleReady` re-parses JSON from `handleHealth` — inefficient | Audit | L-2 | ✅ CLOSED | `handleReady` is independent, does not re-parse handleHealth output |
| P3-3 | Metrics endpoint counts `publish` phase instead of `finalize` for successes | Audit | L-3 | ✅ CLOSED | `deals_processed.published` is the correct success metric |
| P3-4 | `normalizeText` strips all non-ASCII characters — breaks international content | Audit | L-4 | ✅ CLOSED | Regex only removes control chars; international text preserved |
| P3-5 | `handleAnalytics` has no rate limiting or pagination | Audit | L-7 | ✅ CLOSED | Rate limiting added via `createRateLimitMiddleware` in router.ts |
| P3-6 | `handleMCPCall` legacy endpoint has no rate limiting | Audit | L-17 | ✅ CLOSED | Rate limiting added to legacy `/mcp/v1/tools/call` route |
| P3-7 | `handleDiscover` triggers pipeline synchronously — timeout risk | Audit | M-10 | ✅ CLOSED | Pipeline executes async via `ctx.waitUntil()`, returns 202 immediately |
| P3-8 | `research@example.com` in User-Agent header | Audit | L-15 | ✅ CLOSED | Placeholder email removed; CONFIG.USER_AGENT uses proper string |
| P3-9 | `handleGetResearchResults` defined but possibly unregistered | Audit | H-2 | ✅ CLOSED | Route registered at `router.ts:344-349` with `withAuth` |

### Documentation & Configuration

| ID | Item | Source | Audit Ref | Status | Resolution |
|:---|:---|:---|:---|:---|:---|
| P3-10 | System reference doc lists agents as "pending" — contradicts AGENTS.md | Audit | H-7 | ✅ CLOSED | SYSTEM_REFERENCE.md v0.2.0 — added middleware, D1, DO, continuous verification, DORA metrics |
| P3-11 | `wrangler.toml` and `wrangler.jsonc` coexist — confusing | Audit | M-17 | ✅ CLOSED | Only `wrangler.jsonc` exists; `wrangler.toml` removed |
| P3-12 | `rootDir: "."` in tsconfig — should be `"./worker"` | Audit | M-18 | ⬜ NO-FIX | Correct as-is for monorepo-style project (includes bot/, tests/, scripts/) |
| P3-13 | Multiple root config files violate directory policy | Audit | L-10-L-14 | ⬜ NO-FIX | Standard config files for JS/TS project; no policy violation |

### Features & Integration

| ID | Item | Source | Status | Resolution |
|:---|:---|:---|:---|:---|
| P3-14 | MCP pagination — cursor parameters defined but logic not implemented | Swarm | ✅ CLOSED | Cursor-based pagination in tools/list and resources/list |
| P3-15 | MCP progress notifications — `_meta.progressToken` defined but unused | Swarm | ✅ CLOSED | Progress embedded in response `_meta` per MCP spec |
| P3-16 | E2E local env setup — 7/26 tests fail with 401 (auth tokens) | FOLLOWUP | ⬜ DEFERRED | Auth setup infrastructure exists; runtime env config needed |
| P3-17 | No OpenTelemetry / distributed tracing | Audit | ⬜ DEFERRED | Cloudflare observability enabled; OTEL SDK integration deferred |
| P3-18 | `bot/` and `extension/` directories need documentation review | Audit | ✅ CLOSED | Comprehensive READMEs exist in both directories |

---

## ADR-015 Proposals (Deferred — Require Dedicated Sprints)

| ID | Proposal | Effort | Risk |
|:---|:---|:---|:---|
| ⬜-1 | **C-1: Durable Objects for core state** — eliminates KV race conditions | 1-2 weeks | Cold start latency |
| ⬜-2 | **C-2: Durable Execution for long pipelines** — enables >30s pipelines | 1-2 weeks | API stability |
| ⬜-3 | **C-3: Agent Memory for conversational state** — bot conversation persistence | 1 week | Service availability |
| ⬜-4 | **C-4: AI Gateway integration** — unified LLM observability | 1 week | Not yet needed |
| ⬜-5 | **H-1: Continuous Verification (10th gate)** — post-publication health monitoring | 1-2 weeks | Metric stability |
| ⬜-6 | **H-2: DORA metrics dashboard** — deployment/lead time/CFR/MTTR tracking | 1 week | Data pipeline |
| ⬜-7 | **H-3: Build-Once-Promote-Everywhere** — artifact immutability via R2 | 1 week | CI/CD changes |

---

## Feature Epics (Not Started)

| Epic | Priority | Issues | Effort |
|:---|:---|:---|:---|
| **User Management & Auth** (#284) | P1 | JWT auth, RBAC, user CRUD, API key management | 2-3 weeks |
| **Web UI Dashboard** (#302) | P3 | React dashboard with deal management, analytics, referral tracking | 3-5 weeks |
| **Real Web Research Enhancements** | P2 | Full Reddit/ProductHunt/GitHub/HN API integration beyond current simulation | 2-3 weeks |

---

## Dependency Graph

```
ADR-016 (Middleware Layer) ─────────────────────┐
    │                                            │
    ├── P1-1 (D1 Auth) ─────────────────────────┤
    ├── P1-2 (API Rate Limits) ─────────────────┤
    └── P1-3 (Submit Auth) ─────────────────────┤
                                                 │
P1-4 (Webhook Routes) ─── independent ──────────┤
P1-5 (Reactivate Route) ── independent ─────────┤
P1-7 (evolveSourceTrust) ─ independent ─────────┤
                                                 │
P2 File Splits (P2-1 through P2-6) ─────────────┤
    │                                            │
    └── P2 Test Coverage (P2-12 through P2-23) ──┤
                                                 │
P1-6 (Lock Race) depends on ⬜-1 (DO migration)  │
                                                 │
⬜ ADR-015 Proposals ─── independent epics ──────┘
```

---

## Merge Order (Recommended Execution Sequence)

### Phase 1: Quick Wins — ✅ COMPLETED (2026-07-07)
1. ~~**P1-5**: Register reactivate route~~ ✅
2. ~~**P1-4**: Register 10 webhook endpoints~~ ✅
3. ~~**P2-24, P2-25**: Deduplicate shared functions~~ ✅
4. ~~**P2-26**: Remove unused dependencies~~ ✅ (used by bot/)
5. ~~**P2-8**: Fix `generateSnapshotHash` sort logic~~ ✅
6. ~~**P2-9**: Fix hardcoded reward type in `handleSubmit`~~ ✅
7. ~~**P1-6**: D1 CAS lock + PipelineLock DO~~ ✅
8. ~~**P1-7**: Implement `evolveSourceTrust` logic~~ ✅
9. ~~**P2-7 through P2-11**: Fix misleading implementations~~ ✅
10. ~~**P2-1 through P2-6**: Split oversized files~~ ✅

### Phase 2: Security Hardening — ✅ COMPLETED (2026-07-07)
11. ~~**ADR-016**: Design and implement unified middleware layer~~ ✅ `worker/lib/middleware/` (4 files)
12. ~~**P1-1**: Add D1 endpoint auth~~ ✅ via middleware pipeline with `auth: "internal"`
13. ~~**P1-2**: Apply rate limiting to all API endpoints~~ ✅ via config-driven rate limit middleware

### Phase 3: Test Coverage — ✅ COMPLETED (2026-07-07)
14. ~~**P2-21**: Write tests for NLQ executor~~ ✅ 37 tests in `tests/unit/nlq/query-builder/executor.test.ts`

### Phase 4: P3 Quick Fixes — ✅ COMPLETED (2026-07-07)
15. ~~**P3-5**: Add rate limiting to handleAnalytics~~ ✅ `createRateLimitMiddleware` in router.ts
16. ~~**P3-6**: Add rate limiting to legacy handleMCPCall~~ ✅ `createRateLimitMiddleware` in router.ts
17. ~~**P3-7**: Make handleDiscover async~~ ✅ `ctx.waitUntil()` + 202 response
18. ~~**P3-10**: Update SYSTEM_REFERENCE.md~~ ✅ v0.2.0 with middleware, D1, DO, OTEL, DORA

---

## Infrastructure Constraints (Unfixable — see KNOWN_ISSUES.md)

| ID | Issue | Mitigation Status |
|:---|:---|:---|
| CANTFIX-001 | KV eventual consistency | Mitigated via dual-write; DO migration (⬜-1) is remediation path |
| CANTFIX-002 | Vitest pool worker crashes | Workaround: `pool: "forks"` + `continue-on-error` |
| CANTFIX-003 | D1 beta status | Mitigated via dual-write + feature flags |
| — | Secret detection false positives | Workaround: `continue-on-error` + allowlist |
| — | GitHub Actions resource limits | Managed: cache strategy + concurrency limits |
| — | Browser extension API limits | Designed for: chrome.storage + graceful degradation |
| — | External API rate limits | Mitigated: circuit breakers + caching + backpressure |
| — | Workers runtime limits (30s CPU, 128MB) | Designed for: batching + streaming + pagination |
| — | Cron minimum interval (1 min) | Accepted: pipeline runs every 6h, webhooks for real-time |

---

*Cross-referenced from: `reports/analysis/codebase-audit-2026-04-04.md` (50 items), `reports/analysis/swarm-missing-implementations-2026-04-04.md` (31 items), `reports/analysis/feature-gap-analysis.md`, `plans/ADR-015-harness-cloudflare-2026-best-practices.md`, `plans/FOLLOWUP-*.md`, and `agents-docs/KNOWN_ISSUES.md`.*
