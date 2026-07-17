# Track B — Code Quality

## Findings

### Magic Numbers
- `worker/lib/security.ts`: DNS_TIMEOUT_MS (2000), IPV6_BITS (128), etc. are already extracted to constants.
- `worker/lib/webhook/delivery.ts`: `maxErrorSize = 10 * 1024` (10KB) is hardcoded in `sendWebhookToSubscription`.
- `worker/lib/webhook/delivery.ts`: `expirationTtl: 7 * 24 * 60 * 60` (7 days) is hardcoded.
- `worker/lib/webhook/delivery.ts`: `expirationTtl: 30 * 24 * 60 * 60` (30 days) is hardcoded.

### console.log
- No `console.log` found in `worker/`. Verified via grep.

### TODO / FIXME
- `worker/lib/utils.ts:165`: // TODO: Add more robust error handling for edge cases
- `worker/pipeline/stage.ts:12`: // FIXME: Optimization needed for large deal sets (fixed in memory but comment remains)

### Large Files (> 500 lines)
- `extension/popup.js`: 589 lines
- `worker/state-machine.ts`: 512 lines

## Actionable Fixes
1. Extract magic numbers in `worker/lib/webhook/delivery.ts` to constants.
2. Remove the outdated FIXME in `worker/pipeline/stage.ts`.
