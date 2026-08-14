# Test Coverage Audit - 2026-08-14

## Findings

The public configuration utility functions `parseBoundedIntegerConfig` and `getTrustThreshold` in `worker/lib/config-utils.ts` are currently missing explicit unit tests in `tests/unit/config-validation-enhanced.test.ts`.

## Action Plan

We will add coverage for:
1. `parseBoundedIntegerConfig`
   - Parsed successfully with valid value in range.
   - Throws error if parsed value is not an integer.
   - Throws error if parsed value is out of range (too small or too large).
   - Throws error if parsed value is not a safe integer.
   - Returns fallback when value is undefined or an empty string.

2. `getTrustThreshold`
   - Returns CONFIG.MIN_TRUST_SCORE fallback if env.TRUST_THRESHOLD is missing.
   - Parses a valid threshold string successfully.
   - Clamps parsed values outside [0, 1] range safely.
   - Falls back to CONFIG.MIN_TRUST_SCORE if parsed value is NaN.
