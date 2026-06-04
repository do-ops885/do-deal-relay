# Follow-Up: Pre-Existing Issues Across PR Branch Files

**Date**: 2026-06-04
**Status**: Open
**Severity**: Low (code quality, not functional)

## Overview

While applying the Fix-Forward rule during Codacy CI fix work, the following pre-existing issues were identified in source files. These are not caused by PR changes and exist in files modified by other commits on this branch.

## Issues Found

### 1. console.log in production source files (8 files)

These files contain `console.log` calls that should use the structured logger instead:

- `worker/lib/feature-flags.ts`
- `worker/lib/logger/structured.ts`
- `worker/lib/rate-limit-kv.ts`
- `worker/lib/validation/url-validator.ts`
- `worker/lib/validation/reward-scraper.ts`
- `worker/lib/validation/code-validator.ts`
- `worker/lib/global-logger.ts`
- `worker/lib/webhook-sdk.ts`

**Note**: `global-logger.ts` and `logger/structured.ts` may legitimately use `console.log` as part of the logging infrastructure itself. The other 6 files should migrate to the structured logger.

### 2. TODO/FIXME markers (1 file)

- `tests/unit/d1-queries.test.ts` — contains a TODO that should be resolved or converted to an issue.

### 3. Deprecated patterns (3 files)

- `worker/routes/utils.ts` — contains deprecated API usage
- `worker/lib/nlq/hybrid-classifier.ts` — deprecated pattern
- `worker/lib/nlq/ai-enhancer.ts` — deprecated pattern

### 4. No TypeScript/ESLint suppressions

Zero `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or `eslint-disable` comments found — clean.

## Proposed Resolution

1. **console.log migration** (Medium effort): Replace `console.log` with the structured logger in the 6 non-logger files. Requires importing `createLogger` from `worker/lib/logger/structured.ts`.
2. **TODO resolution** (Low effort): Review the TODO in `d1-queries.test.ts`, either implement the fix or convert to a tracked issue.
3. **Deprecated pattern cleanup** (Medium effort): Review the 3 files with deprecated patterns and migrate to current APIs.

## Dependencies

- Logger migration should be done after the structured logger is verified stable in production.
- Deprecated pattern cleanup depends on understanding what replaces the deprecated APIs.

## Related

- Guardrail: `agents-docs/accuracy-guardrails.md` — Fix-Forward rule
- Skill: `typescript-coding-standards` — hot file coordination
