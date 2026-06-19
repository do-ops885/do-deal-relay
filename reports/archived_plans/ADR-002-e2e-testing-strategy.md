# ADR 002: E2E Testing Strategy

## Context

The project has Playwright E2E tests in `tests/e2e/api.spec.ts`, but they were not fully validated or integrated into the CI/CD pipeline. The tests also lack authentication support for protected endpoints and fail when the environment (like local development) has uninitialized storage.

## Decision

We will implement a robust E2E testing strategy that supports multiple environments (local, staging, production) and integrates seamlessly into the CI pipeline.

### 1. Environment Configuration
- Use `TEST_BASE_URL` environment variable to point to the target worker.
- Default to `http://localhost:8787` for local development.

### 2. Authentication Support
- Introduce `TEST_API_KEY` environment variable.
- Update Playwright tests to include this key in the `X-API-Key` header for protected endpoints.
- For local testing, the key will be seeded into the local KV storage during the test setup phase.

### 3. Data Initialization (Local)
- For local `wrangler dev` runs, use a setup script or manual `wrangler kv` commands to:
  - Seed a valid API key with `admin` role.
  - Seed a mock production snapshot to ensure `/health` returns 200 and `/deals` returns data.

### 4. CI Integration
- The CI workflow will:
  - Install Playwright dependencies.
  - Start `wrangler dev` in the background.
  - Seed local KV with a known test API key and mock data.
  - Run `npm run test:e2e` with `TEST_API_KEY` set.
  - Treat E2E failures as build failures (removing `continue-on-error: true`).

### 5. Staging/Production Validation
- Tests can be run manually or via manual workflow triggers against staging/production by providing `TEST_BASE_URL` and a valid `TEST_API_KEY`.

## Consequences

- Improved reliability of the Deal Discovery System through automated browser-based API testing.
- Requirement to manage and securely provide `TEST_API_KEY` for staging/prod testing.
- Faster detection of regressions in API endpoints and authentication logic.
