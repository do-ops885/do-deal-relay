# SPEC: Fix Codacy Warnings in legacy-routes.ts

**Created**: 2026-07-09
**Priority**: P1 (CI blocking)
**File**: `worker/router/legacy-routes.ts`
**Warnings**: 5 (unused import, unnecessary conditionals, non-null assertion)

## Acceptance Criteria

1. Remove unused `jsonResponse` import (line 2)
2. Remove unnecessary `??` operators on regex match groups (lines 321, 329)
3. Remove unnecessary type check on regex match group (line 398)
4. Replace forbidden non-null assertion with safe access (line 400)
5. All TypeScript type checks pass
6. No functional changes to route handling

## Technical Analysis

### Warning 1: Unused Import (line 2)
- `jsonResponse` imported from `../routes/utils` but never used
- Fix: Remove the import

### Warning 2 & 3: Unnecessary `??` (lines 321, 329)
- `dealExplainMatch[1]` and `dealValidateMatch[1]` are always `string` when match succeeds
- Regex match groups return `string` (not `string | undefined`) when the overall match is truthy
- Fix: Remove `?? ""` fallback

### Warning 4: Unnecessary Conditional (line 398)
- `experienceMatch[1] !== undefined` is always true when `experienceMatch` is truthy
- TypeScript knows `[1]` is `string` after match succeeds
- Fix: Remove the conditional wrapper

### Warning 5: Non-null Assertion (line 400)
- `experienceMatch[1]!` uses forbidden `!` operator
- Fix: Use destructuring with type assertion or restructure

## Execution Plan

| Task | Agent | Action |
|------|-------|--------|
| Fix unused import | code-crafter | Remove line 2 import |
| Fix regex conditionals | code-crafter | Remove `??` operators and simplify conditionals |
| Verify typecheck | test-runner | Run `npx tsc --noEmit` |

## Risk Assessment

- **Risk**: Low — all changes are type-level fixes, no runtime behavior change
- **Rollback**: Git revert single commit
