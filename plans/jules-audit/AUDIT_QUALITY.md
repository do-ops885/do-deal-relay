# Code Quality Audit - 2026-07-06

## Summary
- **Production Logs**: 10 instances of `console.log` in `extension/` and logging middleware.
- **Magic Numbers**: Found in `worker/validation/gates/price-sanity.ts` and `worker/pipeline/discover.ts`.
- **File Lengths**: `worker/state-machine.ts` is 518 lines (exceeds 500 line soft limit).

## Production Logs (`console.log`)

| File | Line | Context |
|------|------|---------|
| extension/background.js | 34, 311, 342, 397, 413, 418 | Extension initialization and API submission logs. |
| extension/popup.js | 395 | Submission log. |
| worker/lib/logger/structured.ts | 77 | Expected (part of logging infra). |
| worker/lib/global-logger.ts | 113 | Expected (part of logging infra). |

## Magic Numbers

| File | Line | Number | Suggested Constant |
|------|------|--------|--------------------|
| worker/validation/gates/price-sanity.ts | 28 | 100 | `MAX_REWARD_VALUE` |
| worker/pipeline/discover.ts | 55 | 100 | `DEFAULT_CANDIDATE_BUDGET` |

## Large Files (> 500 lines)

| File | Lines | Status |
|------|-------|--------|
| worker/state-machine.ts | 518 | Approaches 600 line hard limit. Refactoring recommended. |
