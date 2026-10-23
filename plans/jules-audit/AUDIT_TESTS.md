# Test Coverage Audit

## Findings

- **Module**: `worker/routes/admin/keys.ts` (`handleCreateApiKey`)
- **Uncovered Logic**: Verification that default rate limits (`requestsPerMinute: 60`, `requestsPerHour: 1000`) are properly set when omitted from request body, and that custom rate limits are correctly preserved when provided.

## Actionable Changes
Add unit tests in `tests/unit/admin-keys.test.ts` to test default and custom rate limit behavior for `handleCreateApiKey`.
