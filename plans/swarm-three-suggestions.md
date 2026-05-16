# Swarm Execution Plan: Three Follow-up Suggestions

## Goal
Execute 3 independent suggestions in parallel with swarm coordination:
1. Run Playwright E2E tests against deployed worker
2. Add Prettier auto-format to pre-commit hook (scripts/pre-commit-hook.sh)
3. Audit remaining `as any` casts in source files + suggest replacements

## Strategy
**Hybrid**: Phase 1 (plan + handoff) → Phase 2 (parallel execution) → Phase 3 (review) → Phase 4 (synthesis)

## Phase 1: Plan & Handoff
- Write execution plan → `plans/swarm-three-suggestions.md`
- Log handoff in `agents-docs/coordination/handoff-log.jsonl`

## Phase 2: Parallel Execution (3 independent tasks)

### Task A: Run Playwright E2E tests
- Action: Start `npm run dev` in background, seed KV with auth keys, run `npx playwright test tests/e2e/`
- Validated by: Test pass/fail output

### Task B: Add Prettier auto-format to pre-commit
- Action: Add Prettier format check + auto-format to Guard Rail 6 in `scripts/pre-commit-hook.sh`
- Validated by: Running the hook against staged files with formatting issues

### Task C: Audit remaining `as any` in source (non-test) files
- Action: Search for `as any` in `worker/` and `bot/` dirs (excluding `tests/`)
- Action: Categorize each by replaceability (can be typed, needs unknown, needs as any)
- Produces: Report file in `reports/as-any-audit.md`

## Phase 3: Code Review
- Review any file changes from Task B
- Validate no type errors introduced

## Phase 4: Synthesis
- Update `agents-docs/coordination/state.json`
- Append to `agents-docs/coordination/handoff-log.jsonl`
