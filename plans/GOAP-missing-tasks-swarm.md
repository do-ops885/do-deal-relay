# GOAP Execution Plan: Missing Tasks Swarm

**Primary Goal**: Implement remaining follow-up tasks identified in plans/ audit
**Created**: 2026-07-01
**Status**: In Progress
**Execution Strategy**: Parallel Swarm (3 independent tasks)
**Branch**: `feat/goap-missing-tasks-swarm`

---

## 1. Task Analysis

### Identified Missing Tasks

| # | Task | Source | Priority | Complexity |
|---|------|--------|----------|------------|
| 1 | Add E2E JWT token acquisition for deal endpoint tests | FOLLOWUP-e2e-local-env-setup.md | High | Medium |
| 2 | Add cheerio as explicit dependency | FOLLOWUP-issues-not-addressed.md (P1 #289) | Medium | Trivial |
| 3 | Expand calculateAdaptiveBudget unit tests | jules-audit/AUDIT_TESTS.md | Medium | Low |

### Dependencies
- All 3 tasks are **independent** — no cross-dependencies
- Can be executed in parallel via swarm

---

## 2. Task Decomposition

### Task 1: E2E JWT Token Acquisition
**Agent**: code-crafter
**Files**: `tests/e2e/global-setup.ts`, `tests/e2e/setup-auth.sh`

**What**: The E2E setup seeds API keys into KV but does not register test users or obtain JWT tokens. The FOLLOWUP notes 7/26 tests fail with 401 on `/deals` endpoints. Add a step to `setup-auth.sh` that uses `wrangler dev` to register a test user and capture the JWT, then export it for test use. Update `global-setup.ts` to pass the JWT to tests via environment variable.

### Task 2: Cheerio Explicit Dependency
**Agent**: code-crafter
**Files**: `package.json`

**What**: `cheerio` is imported in `worker/lib/research-agent/referral-extractor.ts` but only exists as a transitive dependency in `package-lock.json`. Add it as an explicit dependency in `package.json`.

### Task 3: Discovery Budget Test Expansion
**Agent**: code-crafter
**Files**: `tests/unit/discovery-budget.test.ts`

**What**: Add edge case tests per jules-audit recommendation:
- Boundary trust threshold (exactly 0.7)
- Zero budget (perSourceBase = 0)
- Zero highTrustBonus
- MEDIUM maturity threshold (discovery_count = 5)
- Combined high trust + low validation penalty
- All-zeros source config

---

## 3. Execution Plan

### Phase 1: Parallel Swarm Execution
- Launch 3 code-crafter agents simultaneously
- Each agent works on independent task
- No file conflicts (different files per task)

### Phase 2: Quality Gate
- Run `npm run typecheck` to verify TypeScript
- Run `npm run test:unit` to verify tests pass
- Run `npm run lint` to verify formatting

### Phase 3: Commit & PR
- Atomic commits per task
- Push branch and create PR

---

## 4. Success Criteria

- [ ] E2E setup obtains JWT tokens for deal endpoint tests
- [ ] cheerio is explicit dependency in package.json
- [ ] Discovery budget tests cover edge cases
- [ ] All existing tests still pass
- [ ] TypeScript compiles without errors
- [ ] PR created with clear description
