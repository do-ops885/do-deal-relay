# Track C — Test Coverage — 2026-10-05

## Audit Summary
Evaluated core configuration parsing and validation logic in `worker/lib/config-utils.ts`.

## Uncovered / Edge Case Scenarios Identified
1. **Bare Hyphen Rejection**: Verify `parseBoundedIntegerConfig` throws an integer parsing error when provided with a bare hyphen (`"-"`).
2. **Numeric Separator Rejection**: Verify `parseBoundedIntegerConfig` rejects strings containing underscore numeric separators (e.g. `"1_000"`).
3. **Negative Zero Parsing**: Verify `parseBoundedIntegerConfig` handles negative zero (`"-0"`) correctly within allowed integer bounds.

## Action Plan
Add new unit tests covering these 3 edge cases in `tests/unit/config-validation-enhanced.test.ts`.
