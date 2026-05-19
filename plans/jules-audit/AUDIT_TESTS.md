# AUDIT_TESTS.md

- **Low Coverage Areas**:
  - `worker/lib/nlq/ai/`: Many files have 0% or low coverage (e.g., `ai-enhancer.ts`, `entities.ts`, `intent.ts`).
  - `worker/lib/validation/url-validator.ts`: Low coverage (4.4%).
  - `worker/routes/core/analytics.ts`: 0% coverage.

## Proposed New Tests
1. **Unit Test for `validateIntent` in `worker/lib/nlq/ai/intent.ts`**:
   - Verify that it correctly identifies valid intents and defaults to "search" for invalid ones.
2. **Unit Test for `logger` in `worker/lib/global-logger.ts`**:
   - Verify log level filtering and entry formatting.
3. **Unit Test for `shouldLog` in `worker/lib/global-logger.ts`**:
   - Ensure it respects the minimum log level.
