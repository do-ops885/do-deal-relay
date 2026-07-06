# GOAP Swarm Execution Plan V3 — 2026-07-06

**Generated**: 2026-07-06
**Strategy**: Hybrid (Sequential research → Parallel implementation → Sequential validation)
**Source**: GOAP_STATE.md deferred items + ADR-015 proposals
**Skills Used**: web-search-researcher, typescript-coding-standards, durable-objects, structured-logging, metrics-pipeline

---

## Task Analysis

**Primary Goal**: Resolve all actionable deferred items from GOAP_STATE.md
**Constraints**: Must pass typecheck, existing tests, and quality gates; no breaking changes
**Complexity**: Medium-High (4 independent research tasks → 2-3 implementation tasks)

### Open Items Inventory

| ID | Item | Priority | Status | Effort | Actionable? |
|:---|:---|:---|:---|:---|:---|
| P3-12 | tsconfig rootDir "." vs "./worker" | 🟢 | ⬜ DEFERRED | 15 min | Yes (investigate) |
| P3-13 | Multiple root config files | 🟢 | ⬜ DEFERRED | 30 min | Yes (investigate) |
| P3-16 | E2E local env setup (7/26 tests fail) | 🟢 | ⬜ DEFERRED | 2-4 hours | Yes (investigate) |
| P3-17 | No OpenTelemetry / distributed tracing | 🟢 | ⬜ DEFERRED | 1-2 weeks | Yes (research) |
| ⬜-1 | Durable Objects for core state | ⬜ | DEFERRED | 1-2 weeks | Yes (research) |
| ⬜-2 | Durable Execution for long pipelines | ⬜ | DEFERRED | 1-2 weeks | Yes (research) |
| ⬜-5 | Continuous Verification (10th gate) | ⬜ | DEFERRED | 1-2 weeks | Yes (research) |
| ⬜-6 | DORA metrics dashboard | ⬜ | DEFERRED | 1 week | Yes (research) |

---

## Execution Plan

**Strategy**: Hybrid (Research phase → Implementation phase → Validation phase)

### Phase 1: Research (Parallel - 4 agents)

All research tasks are independent and can run concurrently.

```
┌─────────────────────────────────────────────────────────────────┐
│                    GOAP Swarm Controller                        │
│  Strategy: Hybrid (Research → Implement → Validate)             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┬───────────────┐
          ▼               ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Agent 1  │    │ Agent 2  │    │ Agent 3  │    │ Agent 4  │
    │ P3-12/13 │    │ P3-17    │    │ ⬜-1/2    │    │ ⬜-5/6    │
    │ Config   │    │ OTEL     │    │ DO/DE    │    │ Metrics  │
    │ Audit    │    │ Research │    │ Research │    │ Research │
    └──────────┘    └──────────┘    └──────────┘    └──────────┘
          │               │               │               │
          └───────────────┼───────────────┼───────────────┘
                          ▼
              ┌───────────────────────┐
              │  Research Complete    │
              │  (4 reports ready)    │
              └───────────────────────┘
                          │
                          ▼
### Phase 2: Implementation (Parallel - 2-3 agents)

Based on research findings, implement quick wins.

          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Agent 5  │    │ Agent 6  │    │ Agent 7  │
    │ Config   │    │ OTEL     │    │ Docs     │
    │ Fixes    │    │ Setup    │    │ Update   │
    └──────────┘    └──────────┘    └──────────┘
          │               │               │
          └───────────────┼───────────────┘
                          ▼
              ┌───────────────────────┐
              │  Implementation Done  │
              └───────────────────────┘
                          │
                          ▼
### Phase 3: Validation (Sequential)

              ┌───────────────────────┐
              │  Typecheck + Tests    │
              └───────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Update GOAP_STATE    │
              └───────────────────────┘
```

---

## Task Details

### Task 1: P3-12/13 — Config Audit (Agent: explore)
- **Research**: Verify if tsconfig rootDir is actually wrong; inventory all root config files
- **Skills**: typescript-coding-standards
- **Output**: Recommendation report with fix/no-fix decision

### Task 2: P3-17 — OpenTelemetry Research (Agent: web-search-researcher)
- **Research**: OpenTelemetry SDK for Cloudflare Workers, current state 2026
- **Skills**: web-search-researcher, structured-logging
- **Output**: Feasibility report with implementation plan

### Task 3: ⬜-1/2 — Durable Objects/Execution Research (Agent: web-search-researcher)
- **Research**: Cloudflare Durable Objects and Durable Execution for Workers
- **Skills**: durable-objects, agents-sdk
- **Output**: Migration plan for KV → DO

### Task 4: ⬜-5/6 — Metrics/Verification Research (Agent: web-search-researcher)
- **Research**: DORA metrics, continuous verification patterns for Cloudflare
- **Skills**: metrics-pipeline, validation-gates
- **Output**: Implementation plan for 10th gate + DORA dashboard

### Task 5: Config Fixes (Agent: code-crafter)
- **Implement**: Any config fixes identified in Task 1
- **Skills**: typescript-coding-standards
- **Output**: Fixed config files

### Task 6: OTEL Setup (Agent: code-crafter)
- **Implement**: OpenTelemetry instrumentation if feasible
- **Skills**: structured-logging, cloudflare
- **Output**: OTEL wrapper/instrumentation code

### Task 7: Documentation Update (Agent: code-crafter)
- **Update**: GOAP_STATE.md, agents-docs/ with findings
- **Output**: Updated docs

---

## Quality Gates

1. TypeScript compilation (`npx tsc --noEmit`)
2. Existing tests pass (`npx vitest run`)
3. No lint regressions
4. All research reports delivered
5. GOAP_STATE.md updated

## Acceptance Criteria

- [ ] P3-12: tsconfig rootDir decision documented and implemented if needed
- [ ] P3-13: Root config files inventory complete, cleanup plan created
- [ ] P3-17: OpenTelemetry feasibility report with Cloudflare Workers specifics
- [ ] ⬜-1: Durable Objects migration plan with effort estimates
- [ ] ⬜-2: Durable Execution research with API patterns
- [ ] ⬜-5: Continuous Verification (10th gate) design
- [ ] ⬜-6: DORA metrics dashboard plan
- [ ] GOAP_STATE.md updated with all findings
- [ ] Typecheck passes
- [ ] Existing tests pass
