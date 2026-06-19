# GOAP Plan: Missing Implementations & CI Failures — 2026-06-11

**Date**: 2026-06-11
**Orchestrator**: MiMo Code Agent
**Branch**: `fix/missing-implementations-ci-2026-06-11`
**Strategy**: Parallel investigation → atomic fixes → single PR

---

## 1. Task Analysis

**Primary Goal**: Resolve all identified missing implementations, fix CI failures, and harden the codebase.

**Constraints**:
- 13 quality gates must pass (`./scripts/quality_gate.sh`)
- TypeScript strict, zero errors
- 500-line file size limit per source file
- Atomic commits via `./scripts/ai-commit.sh`

**Complexity**: Medium — 3 CI failures + ~15 missing implementations across multiple categories.

---

## 2. CI Failure Inventory

| # | Workflow | Root Cause | Severity | Fix |
|---|----------|------------|----------|-----|
| CI-1 | CI + Format Check | `tests/unit/url-validator-impl.test.ts` Prettier formatting issues | Medium | Run `prettier --write` |
| CI-2 | Security & Compliance | `joi` vulnerability via `artillery` transitive dependency (2 moderate) | Medium | Pin `joi` or accept risk |
| CI-3 | Scheduled Discovery | `/api/discover` returns empty response in production | High | Investigate endpoint |

---

## 3. Missing Implementations Inventory

### Critical (Blocking functionality)

| # | Item | File(s) | Issue |
|---|------|---------|-------|
| M-1 | MCP Research Tool — no real web fetching | `worker/lib/mcp/handlers/research.ts:55` | `handleResearchDomain` only queries DB, never triggers research pipeline |
| M-2 | Rate limiting metadata not enforced | `worker/lib/auth/metadata.ts` + routes | Rate limit stored on API keys but enforcement not wired |
| M-3 | Webhook sync trigger endpoint missing | `worker/routes/webhooks/index.ts` | Spec defines `POST /webhooks/sync/:partnerId/trigger` but not implemented |
| M-4 | Explainability validation gates empty | `worker/lib/explainability.ts:95-96` | `validation.passed/failed` always empty — per-deal gate results not persisted |
| M-5 | Embedding pipeline not automated | `worker/lib/search/` | Types and client exist but no cron/function generates embeddings |

### Medium (Type safety / consistency)

| # | Item | File(s) | Issue |
|---|------|---------|-------|
| M-6 | Duplicate `ExpiringDeal` interface | `worker/types/referral.ts:97` vs `worker/lib/d1/types.ts:44` | Two different shapes with same name |
| M-7 | Semantic search type mismatch | `worker/routes/semantic-search.ts:84` | `h.metadata as never` — metadata cast to `Deal` |
| M-8 | Discord bot `as any` casts | `bot/discord/commands.ts:10,29,35,...` | 12+ `any` type usages |
| M-9 | Silent error swallowing | `worker/lib/mcp/progress.ts`, `worker/routes/auth.ts:465`, `worker/lib/research-agent/request-manager.ts:290` | Empty `catch {}` blocks |

### Lower Priority (Tests / debt)

| # | Item | File(s) | Issue |
|---|------|---------|-------|
| M-10 | 5 skipped D1 stats tests | `tests/unit/d1-queries.test.ts:728-830` | `it.skip` — complex multi-query tests never run |
| M-11 | Cache clear bug (test skipped) | `tests/unit/cache.test.ts:477` | `clear()` uses wrong prefix |
| M-12 | GitHub fallback logger stub | `worker/lib/github/core.ts:30-39` | Fake KV silently discards logs |
| M-13 | Webhook unsubscribe spec mismatch | `worker/routes/webhooks/index.ts:39` | Spec: `DELETE /:id`, impl: `POST` with body |
| M-14 | User management API endpoints missing | `worker/routes/` | RBAC/JWT exist but no user CRUD routes |
| M-15 | MCP pagination not wired to all tools | `worker/lib/mcp/pagination.ts` | Cursor pagination exists but not integrated everywhere |

---

## 4. Decomposition & Execution Order

### Phase 1: CI Green (Sequential — unblocks everything)
- **P1.1**: Fix Prettier formatting in `tests/unit/url-validator-impl.test.ts`
- **P1.2**: Run `npm run lint` and `npm run test:unit` to confirm green
- Quality gate: `./scripts/quality_gate.sh` passes

### Phase 2: Critical Missing Implementations (Parallel swarm)
- **Agent A**: M-1 + M-5 — Wire MCP research tool to real pipeline + add embedding cron trigger
- **Agent B**: M-2 + M-3 — Rate limit enforcement + webhook sync trigger endpoint
- **Agent C**: M-4 + M-6 — Explainability gate persistence + ExpiringDeal dedup
- Quality gate: TypeScript compiles, tests pass

### Phase 3: Type Safety & Error Handling (Sequential)
- **P3.1**: Fix M-7 (semantic search type cast)
- **P3.2**: Fix M-8 (Discord bot `as any` → proper types)
- **P3.3**: Fix M-9 (replace empty catch blocks with structured logging)
- Quality gate: `tsc --noEmit` passes, no new warnings

### Phase 4: Test & Debt Cleanup (Parallel)
- **Agent A**: M-10 + M-11 — Fix skipped D1 stats tests + cache clear bug
- **Agent B**: M-12 + M-13 — GitHub logger + webhook spec alignment
- Quality gate: test count increases, no regressions

---

## 5. Commit Strategy

| Commit | Scope | Message |
|--------|-------|---------|
| 1 | CI | `ci: fix prettier formatting in url-validator-impl.test.ts` |
| 2 | MCP | `feat(mcp): wire research tool to real pipeline` |
| 3 | Webhooks | `feat(webhooks): add sync trigger endpoint + fix unsubscribe spec` |
| 4 | Auth | `feat(auth): enforce rate limiting from API key metadata` |
| 5 | Search | `fix(search): resolve semantic search type mismatch` |
| 6 | Types | `refactor(types): deduplicate ExpiringDeal interface` |
| 7 | Logging | `fix: replace empty catch blocks with structured error logging` |
| 8 | Tests | `test: fix skipped D1 stats tests and cache clear bug` |

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MCP research pipeline integration breaks existing tests | Medium | High | Run full test suite after each agent |
| Rate limit enforcement causes 429s for existing clients | Low | Medium | Add grace period, log-only initially |
| Webhook trigger endpoint needs Cloudflare secrets | Low | Low | Document required secrets in runbook |

---

## 7. Success Criteria

- [ ] All GitHub Actions green on PR
- [ ] TypeScript strict: zero errors
- [ ] Test count ≥ current (1656)
- [ ] No `as any` or `as never` in modified files
- [ ] No empty `catch {}` blocks in modified files
- [ ] All M-1 through M-9 addressed
- [ ] M-10 through M-15 addressed or tracked as follow-up issues
