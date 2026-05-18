# AUDIT TESTS

## Findings
- **Missing Coverage**: Identified that `worker/routes/nlq/utils.ts` had 0% coverage despite containing several important helper functions used in the NLQ pipeline.
- **Flakiness**: Observed intermittent Vitest failures in `tests/unit/ranking.test.ts` and `tests/unit/circuit-breaker.test.ts` (unrelated to current changes).

## Actions Taken
- Created `tests/unit/nlq-utils.test.ts`.
- Added unit tests for:
  - `ENDPOINT_PATH` constant
  - `generateTraceId()`
  - `getNLQLogger()`
  - `getRateLimitConfig()`
- Verified tests pass with `npx vitest run tests/unit/nlq-utils.test.ts`.
- Overall coverage for the project remains stable around the baseline (54% lines).

## Human Review Required
- Flaky tests in `tests/unit/ranking.test.ts` require investigation into floating-point precision issues.
- Worker pool crashes in Vitest occasionally cause "Test suite failed to run" errors; using `pool: "forks"` helps but does not entirely eliminate resource contention in the sandbox.
