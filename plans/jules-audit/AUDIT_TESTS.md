# Test Coverage Audit - 2026-07-06

## Summary
- **Identified Gaps**: Public functions in `worker/lib/sanitize-error.ts` and `worker/lib/utils.ts` lack unit tests.
- **Actionable Findings**: 3 new tests planned for `sanitize-error.ts` and `createTimeoutSignal`.

## Coverage Gaps

| Module | Function | Status |
|--------|----------|--------|
| worker/lib/sanitize-error.ts | `toError` | No tests found. |
| worker/lib/sanitize-error.ts | `sanitizeErrorForClient` | No tests found. |
| worker/lib/utils.ts | `createTimeoutSignal` | No tests found. |

## Planned New Tests
1. **`tests/unit/sanitize-error.test.ts`**: Test `toError` conversion and `sanitizeErrorForClient` filter logic.
2. **`tests/unit/utils-timeout.test.ts`**: Test `createTimeoutSignal` returns a valid AbortSignal that triggers after timeout.
