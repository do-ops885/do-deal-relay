# Track C — Test Coverage Report — 2026-08-20

## Summary
Audited modules for missing unit tests on core business logic.

## New Tests Added

### 1. `getTopDeals`, `getExpiringDeals`, `getRecentDeals`, and `getHighValueDeals`
- **Target File**: `worker/lib/ranking.ts`
- **Test File**: `tests/unit/ranking.test.ts`
- **Coverage Added**:
  - `getTopDeals()`: Verifies deals are sorted by composite score and limited to the specified count.
  - `getExpiringDeals()`: Verifies filtering of deals expiring within N days and sorted by expiry date.
  - `getRecentDeals()`: Verifies filtering of deals discovered within N days and sorted newest first.
  - `getHighValueDeals()`: Verifies filtering of deals meeting or exceeding reward threshold ($50 default) sorted by value.
