# GOAP Plan: Fix CI Failures for PR 528

**Date**: 2026-07-02
**PR**: #528 - docs(plans): progress report re-verifying all P0 critical bugs closed
**Branch**: feat/plans-progress-2026-07-02

## Phase 1: Task Analysis

**Primary Goal**: All CI checks pass on PR 528.
**Root Cause**: Prettier formatting violations in 6 files. `tsc --noEmit` passes cleanly.
**Complexity**: Simple (single formatting fix, no code changes).

### Failing Checks (3 total)
| Check | Cause |
|-------|-------|
| Type Check | `npm run lint` = `tsc --noEmit && prettier --check .` → prettier fails |
| Format Check | Same prettier failure |
| Quality Gate | Includes prettier check (#6) → cascading failure |

### Files Requiring Formatting (6)
1. `tests/unit/scrapers.test.ts`
2. `worker/lib/research-agent/orchestrator/index.ts`
3. `worker/lib/research-agent/scrapers/ai-extractor.ts`
4. `worker/lib/research-agent/scrapers/github.ts`
5. `worker/lib/research-agent/scrapers/hackernews.ts`
6. `worker/lib/research-agent/scrapers/reddit.ts`

## Phase 2: Task Decomposition

| Task | Priority | Deps | Agent |
|------|----------|------|-------|
| Fix formatting in all 6 files | P0 | none | code-crafter (swarm) |
| Verify quality gate passes | P1 | Task 1 | test-runner |
| Commit and push | P2 | Task 2 | general |

## Phase 3: Strategy

**Strategy**: Sequential (fix → verify → commit)
**Quality Gate**: Run `SKIP_TESTS=1 ./scripts/quality_gate.sh` after formatting fix.

## Phase 4: Execution

### Step 1: Run `npx prettier --write` on all 6 files ✅ DONE
### Step 2: Verify `npx tsc --noEmit` ✅ DONE (exit 0)
### Step 3: Verify `npx prettier --check` on PR files ✅ DONE (all clean)
### Step 4: Commit with `fix(ci): format files for prettier compliance`

## Phase 5: Results

| Task | Status |
|------|--------|
| Prettier formatting fix (6 files) | ✅ Complete |
| TypeScript compilation check | ✅ Passes |
| Prettier check on PR files | ✅ All clean |
| Quality Gate (local) | ⚠ `.convex/local/default/config.json` is local-generated, not in CI |
