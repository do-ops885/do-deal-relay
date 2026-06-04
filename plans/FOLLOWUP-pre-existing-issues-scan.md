# Follow-Up: Pre-Existing Issues Across PR Branch Files

**Date**: 2026-06-04
**Status**: Open
**Severity**: Low (code quality, not functional)

## Overview

While applying the Fix-Forward rule during Codacy CI fix work, the following pre-existing issues were identified in source files. These are not caused by PR changes and exist in files modified by other commits on this branch.

## Issues Found

### 1. console.log in source files — FALSE POSITIVE (Resolved)

All 12 `console.log` instances found across 6 files are inside JSDoc `@example` comment blocks or commented-out code — none are in executable code. No migration needed. (`global-logger.ts` and `logger/structured.ts` legitimately use `console.log` as part of the logging infrastructure.)

### 2. TODO/FIXME markers (1 file)

- `tests/unit/d1-queries.test.ts` — contains a TODO that should be resolved or converted to an issue.

### 3. Deprecated patterns (3 files) — Investigated

- `worker/lib/nlq/hybrid-classifier.ts` (line 6): `@deprecated Use ./hybrid/index.ts instead` — **Dead code.** No imports found. Replacement exists at `worker/lib/nlq/hybrid/index.ts`. Safe to delete.
- `worker/lib/nlq/ai-enhancer.ts` (line 6): `@deprecated Use ./ai/index.ts instead` — **Dead code.** No imports found. Replacement exists at `worker/lib/nlq/ai/index.ts`. Safe to delete.
- `worker/routes/utils.ts` (line 82): `@deprecated Use jsonResponse(data, status, request, env) instead` — **10 callers in `worker/routes/nlq/handlers.ts`** still use the old 2-argument signature. Migration required.

### 4. No TypeScript/ESLint suppressions

Zero `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or `eslint-disable` comments found — clean.

### 5. E2E deals 404 (not a code bug)

E2E tests hit `/deals` and get 404. Root cause: `getProductionSnapshot(env)` returns null because KV has no deal data in the local dev environment. Routes are correctly registered and auth works. Fix: seed KV with test deal data before E2E tests.

## Proposed Resolution

1. **console.log migration** — ✅ FALSE POSITIVE. All instances are in JSDoc `@example` comments, not executable code.
2. **TODO resolution** (Low effort): Review the TODO in `d1-queries.test.ts`, either implement the fix or convert to a tracked issue.
3. **Delete dead deprecated modules** (Low effort): Delete `worker/lib/nlq/hybrid-classifier.ts` and `worker/lib/nlq/ai-enhancer.ts` — no imports, replacements exist.
4. **Migrate jsonResponse callers** (Medium effort): Update 10 callers in `worker/routes/nlq/handlers.ts` to use the 4-argument `jsonResponse(data, status, request, env)` signature.
5. **Seed deal data for E2E** (Medium effort): Create a script or global setup step to seed KV with test deals before E2E tests run.

## Dependencies

- Logger migration should be done after the structured logger is verified stable in production.
- Deprecated pattern cleanup depends on understanding what replaces the deprecated APIs.

## Related

- Guardrail: `agents-docs/accuracy-guardrails.md` — Fix-Forward rule
- Skill: `typescript-coding-standards` — hot file coordination
