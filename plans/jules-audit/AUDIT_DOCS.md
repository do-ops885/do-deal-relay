# Track D — Documentation

## Missing JSDoc (Public APIs)
- `worker/lib/metrics/prometheus.ts`: `renderMetrics` is exported but lacks JSDoc.
- `worker/lib/webhook/delivery.ts`: `sendOutgoingWebhooks` has JSDoc, but `getDeadLetterQueue` and `retryDeadLetterEvent` lack full param/return descriptions.

## Actionable Fixes
1. Add JSDoc to `getDeadLetterQueue` and `retryDeadLetterEvent` in `worker/lib/webhook/delivery.ts`.
2. Add JSDoc to `renderMetrics` in `worker/lib/metrics/prometheus.ts`.
