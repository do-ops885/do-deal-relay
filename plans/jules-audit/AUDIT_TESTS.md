# Track C — Test Coverage - 2026-07-28

The test coverage audit targets public functions and core business logic that can benefit from more robust testing coverage and boundary cases.

## Actionable Findings
- **File**: `tests/unit/webhook/delivery.test.ts`
  - **Logic**: Expand test suite for `calculateBackoff` (which computes the backoff duration for webhook delivery retries) to cover the following:
    1. **Multiplier Scaling Progression**: Ensure exponential progression scale matches expected multiplier value step-by-step.
    2. **Max Delay Capping**: Ensure the delay calculates and is strictly capped at `max_delay_ms` under high attempt counts and extreme multiplier values.
    3. **Randomized Jitter Distribution**: Ensure delay varies with randomized jitter across multiple calls while staying within correct mathematical bounds.
