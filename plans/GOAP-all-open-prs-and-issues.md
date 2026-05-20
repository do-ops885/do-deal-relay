# GOAP Plan: Address All Open PRs and Implement All Open Issues

> Goal-Oriented Action Planning for do-deal-relay repository
> Created: 2026-05-18
> Total scope: 3 open PRs + 38 open issues

## Task Analysis

**Primary Goal**: Address review feedback on 3 open PRs and implement all 38 open GitHub issues
**Constraints**: Work must be done in isolated git worktrees per PR; all changes committed and pushed
**Complexity**: Complex (multi-phase, multi-agent orchestrator)

---

## Phase 1: PR Feedback Fixes (3 worktrees, parallel)

### PR #313 — feat/api-auth-implementation
**Branch**: `feat/api-auth-implementation-11900313233742897352`
**Feedback to address**:
1. Fix inverted key expiration TTL logic in `worker/lib/auth.ts` (line 82)
2. Fix N+1 query pattern in key-listing API
3. Add integration tests for 401/403 scenarios
4. Add tests for key revocation logic
5. Update ADR-008 if needed

### PR #311 — fix/css-selector-extraction-research-agent
**Branch**: `fix/css-selector-extraction-research-agent-1950533023805308360`
**Feedback to address**:
1. Fix SSRF potential in API fetchers (string interpolation)
2. Fix GraphQL injection vulnerability
3. Fix memory hazard in generic fetcher (large payloads)
4. Fix inconsistent regex fallback between research agent and discovery pipeline
5. Reduce complexity in `extractor.ts`
6. Add unit tests for `discover.ts` and `extractor.ts`

### PR #307 — fix/typescript-errors-scope
**Branch**: `fix/typescript-errors-scope-13284532045530825237`
**Feedback to address**:
1. Resolve merge conflicts (PR marked as CONFLICTING)
2. Delete temporary `typecheck_*.txt`, `typescript_*.txt` files
3. Ensure .gitignore properly excludes temp files
4. Address remaining ~460 type safety issues
5. Enable strict mode in tsconfig

---

## Phase 2: Issue Implementation (by priority)

### P0/Critical Issues
- **#268** → Already handled by PR #313
- **#269** HMAC disabled → Enable webhook HMAC verification
- **#264** → Already handled by PR #307
- **#273** Security Hardening epic (covers #268-#272)
- **#272** Wildcard CORS → Restrict to configured origins
- **#271** SSRF risk → Validate URLs, restrict fetch targets
- **#270** Open redirect → Validate redirect URLs, restrict protocols
- **#267** Critical Missing Implementations epic

### P1/High Issues
- **#279** Deployment Readiness (env validation, monitoring, rollback, CI)
- **#284** User Management & Auth (schema, JWT, RBAC, API)
- **#278** Environment variable validation on startup
- **#277** Monitoring/alerting/observability
- **#276** Pre-deploy tests using continue-on-error
- **#275** Automated rollback is a no-op

### P2/Medium Issues
- **#293** MCP Pagination & Progress Notifications
- **#292** Result streaming for MCP
- **#291** MCP progress notification support
- **#290** Cursor-based pagination for MCP

### P3/Lower Priority Issues
- **#297** Semantic Search epic (embeddings, vector search)
- **#302** Web UI Dashboard epic
- **#289** Real Web Research with AI Extraction
- **#267** Critical Missing Implementations

---

## Execution Strategy

### Strategy: Hybrid (Parallel + Sequential + Swarm)

| Phase | Strategy | Description |
|-------|----------|-------------|
| 1 | Parallel | Fix all 3 PRs simultaneously in worktrees |
| 2a | Parallel | Fix P0 issues across multiple issue branches |
| 2b | Sequential | P1 issues (depend on P0 security fixes) |
| 2c | Sequential | P2/P3 issues (depend on foundation) |

### Worktree Layout
```
/workspaces/do-deal-relay (base - fix/type-safety-metrics)
├── .worktrees/pr-313-auth/     → PR #313 branch
├── .worktrees/pr-311-selector/ → PR #311 branch
├── .worktrees/pr-307-ts/       → PR #307 branch
```

### Agent Assignment
| Task | Agent | Priority |
|------|-------|----------|
| Auth fix (PR 313) | feature-implementer | P0 |
| CSS extraction fixes (PR 311) | feature-implementer | P0 |
| TS errors + merge conflict (PR 307) | debugger | P0 |
| HMAC verification (Issue 269) | feature-implementer | P0 |
| SSRF fix (Issue 271) | security-fixer | P0 |
| CORS fix (Issue 272) | security-fixer | P0 |
| Open redirect fix (Issue 270) | security-fixer | P0 |
| Deployment readiness (Issue 279) | devops-implementer | P1 |
| User management (Issue 284) | feature-implementer | P1 |
| MCP enhancements (Issue 293) | feature-implementer | P2 |
| Semantic search (Issue 297) | feature-implementer | P3 |
| Web UI dashboard (Issue 302) | frontend-implementer | P3 |

---

## Quality Gates

Each implementation phase must pass:
1. TypeScript compilation (`tsc --noEmit`)
2. Unit tests pass
3. Integration tests pass
4. Code review (via code-reviewer-deepseek-flash)
5. Lint/format checks

---

## Progress Tracking

- [/] Phase 0: Plan created
- [/] Phase 1a: PR #313 feedback fixes (auth integration tests committed & pushed)
- [/] Phase 1b: PR #311 feedback fixes (SSRF protection, sanitizeQuery, prettier, all committed & pushed)
- [/] Phase 1c: PR #307 feedback fixes (CORS wildcard fix, TS fixes in scripts/bot/KVNamespace, committed & pushed)
- [/] Phase 2a: P0/Critical issues assessment complete
- [ ] Phase 2b: P1/High issues — deploy workflow fixes committed, needs CI trigger

## PRs Completed

| PR | Status | Changes |
|----|--------|--------|
| #313 feat/api-auth | ✅ Pushed | `tests/integration/auth-flow.test.ts` - 13 auth tests (401/403/revocation/health) |
| #311 fix/css-selector-extraction | ✅ Pushed (3 commits) | `sanitizeQuery()` guard in all 5 fetch fns, `validateFetchUrl()` IP blocking SSRF protection, prettier format fix |
| #307 fix/typescript-errors | ✅ Pushed | CORS wildcard removed, TS errors fixed in 5 files, KVNamespace imports, merge conflicts resolved |

## P0-P1 Issue Assessment (after investigation)

| Issue | Status | Note |
|-------|--------|------|
| #269 HMAC | ✅ Resolved by PR #314 | PR #314 already created and addresses the `return true` bypass. No duplicate work needed. |
| #272 CORS | ✅ Fixed | `*` wildcard removed from MCP utils and webhooks types, replaced with `getAllowedOrigin()`/`getMCPCORSHeaders()` |
| #271 SSRF | ✅ Fixed via PR #311 | `validateFetchUrl()` with IP blocking + `sanitizeQuery()` injection guard |
| #270 Open redirect | ✅ Already implemented | `validateUrl()` in routes/utils.ts with HTTPS-only and hostname validation |
| #278 Env validation | ✅ Already implemented | `validateConfig()` + `validateKVIsolation()` in `worker/lib/config-utils.ts` |
| #277 Observability | ✅ Already implemented | `/health`, `/health/ready`, `/health/live` endpoints + `/metrics` in Prometheus/JSON formats |
| #279 Deployment Readiness | ⏳ Partially addressed | Sub-issues #275, #276, #277, #278 addressed. KV namespace isolation (#274) pending. |
| #276 Pre-deploy tests | ✅ Fixed | `continue-on-error: true` removed from `deploy-production.yml` test step and `deploy-staging.yml` verify step |
| #275 Rollback | ✅ Fixed | `rollback-on-failure` job now uses `wrangler rollback` with Cloudflare API fallback |
| #284 User Management | ❌ Not started | Schema, JWT, RBAC, API |

## Remaining (P2+)

- #274 KV namespace isolation (sub-task of #279)
- #284 User Management & Auth
- #290-293 MCP enhancements (pagination, streaming, progress notifications)
- #297 Semantic Search epic
- #302 Web UI Dashboard epic
- #289 Real Web Research
- #267 Critical Missing Implementations
