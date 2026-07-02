# GOAP State — Missing Tasks, Implementations & Features

**Version**: 0.1.8
**Generated**: 2026-07-02
**Status**: Active
**Based on**: April 2026 Codebase Audit, Swarm Analysis, Feature Gap Analysis, 2026 Web Research

---

## Executive Summary

This document catalogs ALL known missing implementations, broken functionality, test coverage gaps, and planned features for the do-deal-relay system. It supersedes individual FOLLOWUP plans and prior GOAP states (now archived in `reports/archived_plans/`).

### Overall Status Dashboard

| Category | Total | P0 (Critical) | P1 (High) | P2 (Medium) | P3 (Low) |
|:---|:---|:---|:---|:---|:---|
| Broken Functionality | 8 | 4 | 2 | 2 | 0 |
| Missing Features | 12 | 0 | 2 | 5 | 5 |
| Security Gaps | 6 | 1 | 3 | 2 | 0 |
| Test Coverage Gaps | 16 | 0 | 6 | 8 | 2 |
| Code Quality | 9 | 0 | 0 | 6 | 3 |
| Documentation Gaps | 5 | 0 | 0 | 3 | 2 |
| Architecture Modernization | 5 | 0 | 1 | 2 | 2 |
| **TOTAL** | **61** | **5** | **14** | **28** | **14** |

---

## P0 — CRITICAL (Broken Functionality — Fix Immediately)

### P0-1: Cron Schedule Mismatch — Daily Expiry & Weekly Validation Never Run
**Source**: Audit H-8 | **Status**: ❌ Open
**Location**: `wrangler.jsonc` vs `worker/state-machine.ts`
**Issue**: `wrangler.jsonc` defines cron `"0 */6 * * *"` and `"0 9 * * *"`. The state machine checks for `"0 0 * * *"` (midnight) and `"0 0 * * 0"` (Sunday midnight). These patterns never match.
**Impact**: Deal expiration checks and weekly validation sweeps never execute. Stale deals accumulate indefinitely.
**Fix**: Align cron patterns in `wrangler.jsonc` with state machine checks. Add `"0 0 * * *"` and `"0 0 * * 0"` triggers, or update state machine to match existing patterns.

### P0-2: Success Notification Mislabeled as System Error
**Source**: Audit C-1 | **Status**: ❌ Open
**Location**: `worker/state-machine.ts:327-332`
**Issue**: Pipeline success notification uses `type: "system_error"` instead of a success type.
**Impact**: All successful pipeline completions are logged as errors. Monitoring and alerting are unreliable.
**Fix**: Add `"pipeline_complete"` event type to `NotificationEvent` union in `worker/types.ts` and use it in the finalize phase.

### P0-3: Deactivate Referral Route Never Matches
**Source**: Swarm Analysis Critical #1 | **Status**: ❌ Open
**Location**: `worker/index.ts:102-109`, `worker/routes/referrals.ts`
**Issue**: Regex `/^\/api\/referrals\/([^/]+)$/` ends with `$`, so `/api/referrals/ABC123/deactivate` never matches. The deactivation handler is dead code.
**Impact**: Cannot deactivate referrals via API. Quarantined/expired deals cannot be programmatically removed.
**Fix**: Update regex to `/^\/api\/referrals\/([^/]+)(?:\/deactivate)?$/` and add route for reactivate.

### P0-4: Discovery Engine Constructs Invalid URLs
**Source**: Audit M-9 | **Status**: ❌ Open
**Location**: `worker/pipeline/discover.ts:79-81`
**Issue**: URL patterns use glob syntax (`/invite/*`) concatenated with domain, producing invalid URLs like `https://trading212.com/invite/*`. These will always 404.
**Impact**: Autonomous deal discovery is non-functional. Zero deals discoverable from configured sources.
**Fix**: Replace glob patterns with actual URL paths, or implement a crawler that resolves patterns to real pages.

### P0-5: Only One Source Configured in Discovery Engine
**Source**: Audit H-1 | **Status**: ❌ Open
**Location**: `worker/config.ts:113-125`
**Issue**: `DEFAULT_SOURCES` contains only `trading212.com`. The discovery pipeline cannot discover from multiple sources.
**Impact**: Combined with P0-4, the core value proposition (autonomous discovery) is completely non-functional.
**Fix**: Add 5-10 real referral program sources. Create `scripts/seed-kv.sh` to populate source registry.

---

## P1 — HIGH (Security, Stability, Feature Gaps)

### Security

#### P1-1: D1 Routes Exposed Without Authentication
**Source**: Audit H-3 | **Status**: ❌ Open
**Location**: `worker/index.ts:162-164`, `worker/routes/d1.ts`
**Issue**: All D1 endpoints (`/api/d1/*`) are publicly accessible with no auth. Includes database initialization endpoint.
**Impact**: Anyone can query, enumerate, and initialize the database.
**Fix**: Add API key authentication middleware. Protect `/api/d1/migrations?action=init` endpoint. Use existing `WEBHOOK_API_KEYS` or new API key system.

#### P1-2: Rate Limiting Not Applied to API Endpoints
**Source**: Audit M-8 | **Status**: ❌ Open
**Location**: `worker/lib/rate-limit.ts` — defined but not used in route handlers
**Issue**: Rate-limiting module defines endpoint-specific limits but they're only used in MCP handler. Regular API routes don't invoke `checkRateLimit()`.
**Impact**: API endpoints unprotected against abuse. Research endpoint has no limits despite triggering external fetching.
**Fix**: Apply `createRateLimitMiddleware` or inline `checkRateLimit()` calls to all API routes.

#### P1-3: Research Endpoint Has No Rate Limiting
**Source**: Audit H-4 | **Status**: ❌ Open
**Location**: `worker/routes/referrals.ts:335-394`
**Issue**: The research endpoint triggers web fetching across external sources with no rate limiting.
**Impact**: Attacker could trigger unlimited external HTTP requests, incurring costs.
**Fix**: Apply `/api/research` rate limit (already defined in `ENDPOINT_LIMITS`).

### Feature Gaps

#### P1-4: Real Web Research Agent — All Sources Simulated
**Source**: Feature Gap Analysis #1 | **Status**: ❌ Open
**Location**: `worker/lib/research-agent/`
**Issue**: All discovery sources (ProductHunt, GitHub, Reddit, Hacker News, company sites) use simulated discovery with pattern generation. `use_real_fetching` is disabled by default.
**Impact**: The system cannot autonomously discover deals from the web. Entirely reliant on manual submissions.
**Implementation**:
- [ ] `worker/lib/research-agent/scrapers/producthunt-scraper.ts` — Real ProductHunt API
- [ ] `worker/lib/research-agent/scrapers/github-scraper.ts` — Real GitHub Trending API
- [ ] `worker/lib/research-agent/scrapers/hn-scraper.ts` — Real Hacker News/Algolia API
- [ ] `worker/lib/research-agent/scrapers/reddit-scraper.ts` — Real Reddit API
- [ ] `worker/lib/research-agent/scrapers/generic-scraper.ts` — Cheerio-based HTML extraction
- [ ] `worker/lib/research-agent/scrapers/ai-extractor.ts` — LLM-based content analysis
- [ ] Enable `use_real_fetching: true` with feature flag

#### P1-5: User Management & Authentication System
**Source**: Feature Gap Analysis #3 | **Status**: ❌ Not Started
**Location**: New — `worker/lib/auth/`
**Issue**: No user accounts, no authentication, no personalization. All submissions are anonymous.
**Implementation**:
- [ ] JWT token management (`worker/lib/auth/jwt.ts`)
- [ ] Auth middleware (`worker/lib/auth/middleware.ts`)
- [ ] User CRUD with D1 (`worker/lib/auth/users.ts`)
- [ ] API endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- [ ] User contribution tracking
- [ ] API key management for programmatic access

### Architecture

#### P1-6: Lock Race Condition — Non-Atomic Check-Then-Set
**Source**: Audit C-4 | **Status**: ❌ Open
**Location**: `worker/lib/lock.ts:37-76`
**Issue**: Lock acquisition performs read-then-write without atomicity. Two concurrent workers could both acquire the lock.
**Impact**: Under high concurrency, duplicate pipeline runs could corrupt state.
**Fix**: Use Durable Objects for atomic locking, or D1 unique constraint, or accept KV expiration-based best-effort.

---

## P2 — MEDIUM (Code Quality, Coverage, Polish)

### Broken / Misleading

#### P2-1: Source Trust Evolution Is a No-Op
**Source**: Audit H-6 | **Status**: ❌ Open
**Location**: `worker/pipeline/score.ts:222-235`
**Issue**: `evolveSourceTrust` logs a message but doesn't update trust scores. The trust model is static.
**Fix**: Implement actual trust evolution logic using `updateSourceTrust` from `lib/storage.ts`.

#### P2-2: Snapshot Hash Verification (Gate 9) Is a No-Op
**Source**: Audit M-11 | **Status**: ❌ Open
**Location**: `worker/pipeline/validate.ts:318-384`
**Issue**: Gate 9 always returns `{ passed: true }` because `ctx.snapshot` is not set until after validation.
**Fix**: Move gate to after staging, or implement meaningful hash check using previously stored deal hashes.

#### P2-3: Submit Creates Deals with Hardcoded "cash" Reward Type
**Source**: Audit M-16 | **Status**: ❌ Open
**Location**: `worker/routes/core.ts:284-285`
**Issue**: Deal ID generation hardcodes `"cash"` regardless of user-submitted reward type.
**Impact**: ID collisions possible for same code with different reward types.
**Fix**: Extract reward type from `body.metadata.reward.type`.

#### P2-4: handleDiscover Triggers Pipeline Synchronously
**Source**: Audit M-10 | **Status**: ❌ Open
**Location**: `worker/routes/core.ts:195-212`
**Issue**: `/api/discover` calls `executePipeline()` synchronously, waiting for full pipeline completion (potentially 30s+).
**Impact**: HTTP request timeout. Client gets timeout before pipeline completes.
**Fix**: Trigger pipeline asynchronously, return `run_id` immediately. Add status polling endpoint.

#### P2-5: generateSnapshotHash Has Incorrect Sort Logic
**Source**: Audit M-12 | **Status**: ❌ Open
**Location**: `worker/lib/crypto.ts:32-35`
**Issue**: `Object.keys(deals).sort()` sorts array indices, not deal objects. Sort is meaningless.
**Fix**: Sort deals by ID before serializing, or remove misleading sort.

### Code Quality — File Size Violations

#### P2-6: Split `worker/routes/core.ts` (603 lines → >500 limit)
**Source**: Audit M-1 | **Status**: ❌ Open
**Files**: Split into `health.ts`, `deals.ts`, `submit.ts`, `analytics.ts`.

#### P2-7: Split `worker/lib/github.ts` (688 lines → >500 limit)
**Source**: Audit M-2 | **Status**: ❌ Open
**Files**: Split into `github/content.ts`, `github/issues.ts`, `github/workflows.ts`.

#### P2-8: Split `worker/lib/referral-storage/dual-write.ts` (651 lines → >500 limit)
**Source**: Audit M-3 | **Status**: ❌ Open
**Files**: Split into `dual-write/store.ts`, `dual-write/read.ts`, `dual-write/update.ts`.

#### P2-9: Split `worker/routes/mcp/index.ts` (669 lines → >500 limit)
**Source**: Audit M-4 | **Status**: ❌ Open
**Files**: Split request handlers into separate files: `initialize.ts`, `tools-list.ts`, `tools-call.ts`.

#### P2-10: Split `worker/types.ts` (512 lines → >500 limit)
**Source**: Audit M-6 | **Status**: ❌ Open
**Files**: Separate referral types, research types, pipeline types.

### Test Coverage Gaps

#### P2-11: No Integration Tests for Referral Storage
**Source**: Audit M-13 | **Status**: ❌ Open
**Location**: `tests/` — no `referral-storage.test.ts`
**Add**: Unit tests for `crud.ts`, `search.ts`, `types.ts`. Integration tests for dual-write path.

#### P2-12: No Tests for D1 Routes
**Source**: Audit M-14 | **Status**: ❌ Open
**Location**: `tests/` — no tests for `worker/routes/d1.ts`
**Add**: Integration tests for search, suggestions, stats, deals, domains, categories, migrations, health, similar, recommended, trending.

#### P2-13: No Tests for Email System
**Source**: Audit M-15 | **Status**: ❌ Open
**Location**: `worker/email/` — no tests
**Add**: Unit tests for extraction patterns and security validation.

#### P2-14: No Tests for Critical Components
**Source**: Swarm Analysis | **Status**: ❌ Open

| Component | Lines | Risk |
|:---|:---|:---|
| `worker/lib/d1/queries.ts` | 820 | Database layer |
| `worker/lib/d1/migrations.ts` | 605 | Schema integrity |
| `worker/lib/mcp/tools.ts` | 1100+ | 8 MCP tools |
| `worker/lib/circuit-breaker.ts` | 412 | Resilience |
| `worker/lib/auth.ts` | 259 | Security |
| `worker/lib/cache.ts` | 353 | Caching layer |

### Documentation Gaps

#### P2-15: Webhook Endpoints Not Documented in API.md
**Source**: Swarm Analysis | **Status**: ❌ Open
**Add**: Full webhook endpoint documentation (10 endpoints) to `docs/API.md`.

#### P2-16: NLQ Endpoints Not Documented in API.md
**Source**: Swarm Analysis | **Status**: ❌ Open
**Add**: NLQ endpoints (`/api/nlq`, `/api/nlq/explain`) to `docs/API.md`.

#### P2-17: Email Routes Not Documented
**Source**: Swarm Analysis | **Status**: ❌ Open
**Add**: Email route documentation to `docs/API.md`.

---

## P3 — LOW (Nice-to-Have, Future)

### Features

#### P3-1: Web UI Dashboard
**Source**: Feature Gap Analysis #5, FOLLOWUP-p3-features #2 | **Status**: ❌ Not Started
**Scope**: React + TypeScript + Tailwind dashboard deployed as Cloudflare Pages.
**Features**: Deal management views, analytics dashboard, referral tracking interface.

#### P3-2: Deal Comparison Feature
**Source**: Feature Gap Analysis | **Status**: ❌ Not Started
**Scope**: Side-by-side reward comparison for deals in same category.

#### P3-3: Social Sharing
**Source**: Feature Gap Analysis | **Status**: ❌ Not Started
**Scope**: Share deals with OpenGraph metadata cards.

#### P3-4: User Ratings & Success Reporting
**Source**: Feature Gap Analysis | **Status**: ❌ Not Started
**Scope**: Star ratings + success/failure reporting on deals.

#### P3-5: Browser Extension Enhancement — Auto-Apply at Checkout
**Source**: Feature Gap Analysis | **Status**: ❌ Not Started
**Scope**: Automatically test/apply referral codes at checkout.

### Architecture Modernization

#### P3-6: Durable Objects for Atomic Locking
**Source**: ADR-015 C-1 | **Status**: ❌ Not Started
**Scope**: Replace KV-based lock with Durable Object for true mutual exclusion.

#### P3-7: Durable Execution (Fibers) for Long-Running Pipelines
**Source**: ADR-015 C-2 | **Status**: ❌ Not Started
**Scope**: Wrap pipeline in `runFiber()` for checkpointing across Worker timeouts.

#### P3-8: Agent Memory for Bot Conversations
**Source**: ADR-015 C-3 | **Status**: ❌ Not Started
**Scope**: Integrate Agent Memory for persistent bot conversation state.

#### P3-9: AI Gateway Integration
**Source**: ADR-015 C-4 | **Status**: ❌ Not Started
**Scope**: Route all LLM calls through AI Gateway for unified observability.

### Code Quality

#### P3-10: Unused Dependencies Cleanup
**Source**: Audit M-19 | **Status**: ❌ Open
**Remove**: `discord.js` (unused). Verify `telegraf` actually needed.

#### P3-11: Consolidate wrangler Config Files
**Source**: Audit M-17 | **Status**: ❌ Open
**Issue**: Both `wrangler.toml` and `wrangler.jsonc` exist. Consolide into one.

#### P3-12: Normalize Unicode Handling
**Source**: Audit L-4 | **Status**: ❌ Open
**Location**: `worker/pipeline/normalize.ts:117`
**Fix**: Preserve Unicode letters instead of stripping all non-ASCII.

---

## Completed / In-Progress Items

### ✅ Recently Completed (Since April 2026 Audit)

| Item | Status | Notes |
|:---|:---|:---|
| Semantic Search (P3 #294-#297) | ✅ Complete | Vectorize + embedding pipeline + API |
| D1 Database Integration | ✅ Complete | Dual-write KV + D1, FTS5 search |
| MCP Server | ✅ Complete | 8 tools, 85% spec compliance |
| Webhook System Implementation | ✅ Complete | 10 endpoints built (but not all registered) |
| EU AI Act Logger | ✅ Complete | Compliance logging implemented |
| GitHub Automation | ✅ Complete | Auto-merge workflow verified |
| P3 Follow-up (Semantic Search) | ✅ Complete | All components implemented |
| Swarm v2 Test Coverage | ✅ Complete | PR #527: 70 new tests for stats + D1 client |

### ⚠️ Partially Implemented

| Item | Status | Remaining |
|:---|:---|:---|
| Webhook Route Registration | ⚠️ Partial | 10 endpoints built, need `handleWebhookRoutes()` call in `index.ts` |
| Deal Expiration Automation | ⚠️ Partial | Implementation exists but cron never fires (P0-1) |
| Real Research Agent | ⚠️ Partial | Architecture exists, all sources simulated |
| MCP Pagination | ⚠️ Partial | Cursor parameters defined, logic not implemented |
| MCP Progress Notifications | ⚠️ Partial | `_meta.progressToken` defined but not used |

---

## Implementation Sequence (Recommended Order)

### Sprint 1: Critical Fixes (P0)
1. P0-1: Fix cron schedule mismatch
2. P0-2: Fix success notification type
3. P0-3: Fix deactivate/reactivate routes
4. P0-4: Fix discovery URL construction
5. P0-5: Expand source registry

### Sprint 2: Security Hardening (P1)

1. P1-1: Add D1 endpoint authentication
2. P1-2: Apply rate limiting to all API endpoints
3. P1-3: Add research endpoint rate limiting
4. P1-6: Mitigate lock race condition (P1 → P1 priority)

### Sprint 3: Real Research Agent (P1)

1. P1-4: Implement real scrapers for all sources
2. Enable `use_real_fetching`

### Sprint 4: Feature Completion (P1-P2)

1. P1-5: User management & auth system (P1)
2. P2-1 through P2-5: Fix misleading/broken implementations
3. Register webhook routes (Partial → Complete)

### Sprint 5: Code Quality (P2)

1. P2-6 through P2-10: Split files exceeding 500 lines
2. P2-11 through P2-14: Add test coverage

### Sprint 6: Documentation & Polish (P2-P3)

1. P2-15 through P2-17: Documentation gaps
2. P3-10 through P3-12: Code quality polish

### Backlog: Architecture Modernization (P3)

1. P3-6: Durable Objects for locking
2. P3-7: Durable Execution for pipelines
3. P3-8: Agent Memory for bots
4. P3-9: AI Gateway integration

### Future: Major Features (P3)

1. P3-1: Web UI Dashboard
2. P3-2: Deal comparison
3. P3-3: Social sharing
4. P3-4: User ratings
5. P3-5: Browser extension enhancement

---

## Related Documents

- [ADR-015: Harness & Cloudflare 2026 Best Practices](ADR-015-harness-cloudflare-2026-best-practices.md) — Architecture decisions
- [FOLLOWUP-p3-features.md](FOLLOWUP-p3-features.md) — P3 features status
- [FOLLOWUP-deployment-fix.md](FOLLOWUP-deployment-fix.md) — Deployment pipeline hardening
- [github-automation-plan.md](github-automation-plan.md) — GitHub automation status
- [reports/analysis/codebase-audit-2026-04-04.md](../reports/analysis/codebase-audit-2026-04-04.md) — April 2026 audit (50 issues)
- [reports/analysis/feature-gap-analysis.md](../reports/analysis/feature-gap-analysis.md) — Feature gaps vs modern platforms
- [reports/analysis/swarm-missing-implementations-2026-04-04.md](../reports/analysis/swarm-missing-implementations-2026-04-04.md) — Swarm analysis

---

*This GOAP_STATE.md is the single source of truth for all missing/broken/planned work. Update it when items are completed or new gaps are discovered. Archive old versions to `reports/archived_plans/`.*
