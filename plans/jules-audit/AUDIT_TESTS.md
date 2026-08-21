# Track C — Test Coverage Audit (2026-08-21)

## Public Functions / Modules Lacking Coverage Edge Cases
- Module: `worker/lib/source-expiry.ts`
  - `sourceSaysExpired(sourceUrl)`: Needs coverage for `null` or empty `sourceUrl` handling, non-200 response handling, and unreadable/empty text bodies.

## Action Taken
- Added unit tests in `tests/unit/source-expiry.test.ts` to verify:
  1. `sourceSaysExpired(null)` returns `false` without making network requests.
  2. `sourceSaysExpired` returns `false` when response status is non-200 OK (e.g., 404 or 500).
  3. `sourceSaysExpired` handles empty or unreadable HTTP response bodies gracefully.
