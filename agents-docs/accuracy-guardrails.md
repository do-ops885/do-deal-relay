# Accuracy Guardrails - do-deal-relay

Verification rules and checks to ensure correctness across the codebase.

## Config Contract Changes
**Rule**: When changing `validateConfig()` in `worker/config.ts`, you MUST inspect all call sites where these variables are provided to the worker.

- **Concrete Trigger**: Any edit to the `validateConfig()` block.
- **Concrete Check**: `grep -r 'wrangler dev\|wrangler deploy' .github/workflows/` and verify the new environment variable is present in the workflow YAML.
- **Example**: When `EMAIL_WEBHOOK_SECRET` was added, the E2E tests failed because the variable wasn't injected in the CI workflow.

## Endpoint Response Format Changes
**Rule**: When changing the structure or content-type of an API endpoint, update all assertion layers in the test suite.

- **Concrete Trigger**: Any change to `jsonResponse()` or return types in `worker/index.ts` or `worker/routes/`.
- **Concrete Check**: Run `npm run test` and `npm run test:e2e` to verify body-shape assertions.
- **Example**: Changing the `/metrics` format from JSON to Prometheus text format requires updating all tests that expect JSON.

## Verification after Changes
**Rule**: Prefer evidence from repository state over assumptions. Always verify the effect of a change using read-only tools.

- **Trigger**: Any file modification (creation, edit, deletion).
- **Check**: Use `ls`, `cat`, or `grep` to confirm the file content or existence matches the intention.

## Schema Integrity
**Rule**: All deal data must adhere to the schema defined in `worker/types.ts`.

- **Trigger**: Modifying the deal discovery or normalization logic.
- **Check**: The `schema_validation` gate in the pipeline and unit tests in `tests/unit/validation/`.
