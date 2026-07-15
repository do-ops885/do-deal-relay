# Track C — Test Coverage

## Uncovered Core Logic
- `worker/lib/metrics/prometheus.ts`: Metric registry serialization lacks unit tests.
- `worker/lib/webhook/delivery.ts`: `calculateBackoff` jitter logic is not explicitly tested for distribution.

## Actionable Fixes
1. Add unit test for `calculateBackoff` in `tests/unit/webhook/delivery.test.ts` to verify it respects min/max bounds.
