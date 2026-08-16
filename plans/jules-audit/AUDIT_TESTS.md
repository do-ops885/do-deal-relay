# Track C — Test Coverage Audit

- Target File: `worker/lib/ranking.ts`
- Missing Coverage: Public functions in `worker/lib/ranking.ts` (`calculateDetailedScore`, `sortDeals` for various fields, `rankDeals`, `getExpiringDeals`, `getRecentDeals`, `getHighValueDeals`) lack dedicated unit tests.
- Action: Create `tests/unit/ranking.test.ts` with comprehensive unit test coverage for deal ranking and scoring utilities.
