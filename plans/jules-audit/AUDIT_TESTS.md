# Test Coverage Audit

## Uncovered Core Logic
- worker/email/extraction.ts: 97.08% lines, but some branches uncovered.
- worker/lib/logger/query.ts: 36.66% coverage.
- worker/lib/expiration/notifications.ts: 26.86% coverage.
- worker/routes/validation.ts: 0% coverage.

## Proposed New Tests
1. Unit tests for worker/lib/expiration/notifications.ts (critical business logic).
2. Unit tests for worker/lib/logger/query.ts.
3. Basic integration test for worker/routes/validation.ts.
