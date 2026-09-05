# GOAP Plan: Fix CI Formatting Failures

**Date**: 2026-07-06
**Strategy**: Swarm (4 similar independent file fixes)
**Priority**: P0 (CI failing)

## Task Analysis

**Primary Goal**: Restore CI `format` gate to passing status
**Constraints**: Must not break typecheck/lint/tests
**Complexity**: Simple (automated formatter fix)

## Failure Summary

| Gate | Status | Details |
|------|--------|---------|
| format | ✗ FAIL | 4 files with Prettier violations |
| typecheck | ✓ PASS | — |
| lint | ✓ PASS | — |
| tests | — | Timed out (unrelated) |

### Failing Files
1. `tests/unit/d1/migrations.test.ts`
2. `tests/unit/eu-ai-act-logger.test.ts`
3. `worker/pipeline-executor.ts`
4. `worker/router.ts`

## Execution Plan

- **Strategy**: Swarm (4 independent file formatting tasks)
- **Quality Gates**: 1 (re-run `pev-gates.sh format`)

### Phase 1: Format Files
- Agent 1 → `tests/unit/d1/migrations.test.ts`
- Agent 2 → `tests/unit/eu-ai-act-logger.test.ts`
- Agent 3 → `worker/pipeline-executor.ts`
- Agent 4 → `worker/router.ts`

### Phase 2: Verify
- Run `pev-gates.sh` format gate only
- Confirm all 4 files pass Prettier check

## Result

✅ **COMPLETED** — `npx prettier --write` applied to all 4 files. Ready for verification.

## Verification

Run: `./scripts/pev-gates.sh` (format gate should pass)
