# Swarm: Execute 3 Followup Suggestions (Round 3)

> **Goal**: Execute all 3 suggestions using coordinated swarm with handoff

## Pending Suggestions

| # | Task | Deps | Phase |
|---|------|------|-------|
| 1 | Fix 7 failing Playwright auth tests by seeding KV/D1 | Context-gathering first | 1 (parallel after context) |
| 2 | Bump version 0.1.4 → 0.1.5 across all files | none | 1 (parallel) |
| 3 | Update sprint plan v0.1.5 with latest status | none | 1 (parallel) |
| 4 | Update coordination state + handoff | 1, 2, 3 | 2 (sequential) |

## Strategy: Parallel + Sequential

### Phase 0: Context Gathering (parallel)
- **Agent A**: Read auth.spec.ts + auth handler code for auth test failures
- **Agent B**: Find all version files (package.json, VERSION, worker/version.ts)

### Phase 1: Execution (parallel)
- **Agent A**: Fix auth tests → seed KV/DEALS_SOURCES with test data
- **Agent B**: Bump version 0.1.4 → 0.1.5 across codebase
- **Agent C**: Update sprint plan with deploy + E2E results

### Phase 2: Validation + Handoff
- Typecheck, code review, quality gate
- Update state.json + handoff-log.jsonl
- Commit + push
