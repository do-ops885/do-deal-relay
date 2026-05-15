# AUDIT_TESTS

## Uncovered Core Logic
- `worker/routes/webhooks/incoming.ts`: Minimal coverage for method enforcement.
- `worker/lib/rate-limit.ts`: Coverage exists but could be more robust regarding `X-API-Key` exclusion for identification.

## Proposed Unit Tests
1. `tests/unit/webhook/method-enforcement.test.ts`: Ensure `handleIncomingWebhookRequest` strictly rejects non-POST methods with 405.
2. `tests/unit/rate-limit/client-id.test.ts`: Verify that `getClientIdentifier` ignores `X-API-Key` and uses `CF-Connecting-IP`.
3. `tests/unit/config-validation-budget.test.ts`: Test `validateConfig` with invalid budget configurations (negative numbers, non-numeric).
