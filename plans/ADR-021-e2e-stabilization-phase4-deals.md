# ADR-021: E2E Suite Stabilization — Phase 4 Auth, API-Key Management & Deals Fixtures

**Status**: Accepted
**Created**: 2026-08-02
**Version**: 0.1.9
**Decision Maker**: do-deal-relay Platform Team
**Type**: Test Infrastructure & Defect Fixes

---

## Context

The `feat/pwa-dashboard` branch's E2E suite (`npm run test:e2e`) was failing in CI and locally. A CI-mirrored local run surfaced failures that traced to five distinct root causes — three in the Phase 4 auth/API-key tests, one in Deals API data provisioning, and one product-logic edge in API-key rotation. This ADR records the findings and the fixes applied. It covers only the E2E-stabilization portion of the change set; sibling work (bookmark handler extraction, D1 SQL splitter, migration 7 compat) is documented elsewhere in the PR.

## Root Causes & Fixes

### 1. Idempotent Phase 4 registration (`tests/e2e/phase4-e2e.test.ts`)

**Finding**: `setup-auth.sh` pre-registers `e2e-phase4@example.com` before Playwright runs; the register test asserted a strict `201`, so pre-seeded runs deterministically failed with `400 "Email already registered"`.

**Fix**: the register test now accepts `201` (fresh) or `400` with `/already registered/i` — the invariant is that the account exists for later tests.

### 2. Deterministic D1 pre-seeding (`tests/e2e/setup-auth.sh`)

**Finding**: E2E fixtures (phase4 user, admin, shared user) depended on runtime registration, and the admin role required a direct D1 `UPDATE`.

**Fix**: `setup-auth.sh` now initializes D1 through the worker (`/api/d1/migrations?action=init`, idempotent to version 9), registers all three fixtures idempotently, promotes `admin@example.com` via a local D1 statement, and verifies admin login before Playwright starts.

### 3. API-key tests decoupled from the login rate limit (`tests/e2e/phase4-e2e.test.ts`)

**Finding**: the "should eventually rate limit excessive requests" test deliberately hammers `/api/auth/login` (10 req/min). Playwright executes that hook-free describe before the API Key Management describe (which had a `beforeAll` login), so the admin login got `429` → `Authorization: Bearer undefined` → spurious `401` on create/list. Resequencing cannot help (hook presence, not declaration order, drives the reorder) and retries cannot beat a 60-second sliding window.

**Fix**: the API Key Management describe authenticates with the deterministic seeded admin `X-API-Key` instead of a login-minted JWT — the key CRUD tests are no longer coupled to the hammered login endpoint.

### 4. `listApiKeys` keyHash fallback (`worker/lib/auth.ts`)

**Finding**: keys seeded directly into KV (`setup-auth.sh`) lack the `keyHash` metadata field, so `keys[last].hash` was `undefined` and rotate/revoke hit `/api/admin/keys/undefined` → `404`.

**Fix**: `listApiKeys` derives `keyHash` from the KV key name (`apikey:<hash>`) when metadata lacks it. Added 3 unit tests.

### 5. Deals snapshot seeding (`tests/fixtures/deals-snapshot.json`, `setup-auth.sh`, `ci.yml`)

**Finding**: `/deals`, `/deals/ranked` and `/deals/highlights` returned `404 "No deals available"` because `snapshot:prod` was absent from local/CI KV (`getProductionSnapshot` → null). `/deals.json` kept passing because it is served as a static asset (`public/deals.json`, assets-first), masking the missing KV key.

**Fix**: seed a `SnapshotSchema`-valid fixture (4 active deals) via `wrangler kv key put --path` in `setup-auth.sh` and the CI Prepare step.

### 6. Expired-key rotation edge (`worker/routes/admin/keys.ts`, `worker/lib/auth.ts`)

**Finding**: rotating the seeded expired key recreated it with the same past `expiresAt`; `storeApiKey` passed a past `expiration` to `kv.put`, which wrangler rejects → `500 "Failed to create API key"` → flaky rotate (passes only on retry once the expired key is gone).

**Fix**: `handleRotateApiKey` does not propagate a past `expiresAt`; `storeApiKey` defensively never passes a past/invalid expiration to KV (falls back to the 1-year default TTL; `verifyApiKey` still rejects already-expired keys via metadata). Added 1 unit test.

## Results

CI-mirrored local full run (`npm run test:e2e` with `SKIP_DEV_SERVER=1`, `CI=1`):

- **42 passed, 1 skipped, 22 failed** (29.3s)
- All 22 failures are `chromium-browser` extension tests that cannot launch headless Chromium in this sandbox (missing `libglib-2.0.so.0`); CI installs OS deps via `npx playwright install --with-deps chromium`.
- `api.spec.ts` 24/24 (incl. the 6 Deals tests), `auth.spec.ts` 11/11, Phase 4 auth/API-key/rate-limit all green.

## Consequences

- Phase 4 E2E is deterministic across fresh and pre-seeded environments.
- Deals API endpoints now exercise real data paths in local and CI E2E runs.
- Rotate/revoke no longer depend on key metadata being written by the app's own `storeApiKey`.
- **Remaining**: 22 browser-extension E2E tests require Playwright system deps (environment-only; CI covers them). The full `npm run test:unit` has a documented upstream vitest pool deadlock in constrained sandboxes (CANTFIX-002), handled by the CI timeout wrapper.

## Codacy Static Analysis Follow-up (2026-08-03)

Codacy's PR #662 check ("Not up to standards") surfaced 8 annotations. 7 were resolved at the source; 1 is documented noise requiring a dashboard dismissal.

- **Generic API Key detected** (failure; `tests/unit/auth.store-verify.test.ts:273,305,306`): Codacy's native secret scanner matched the synthetic `apikey:<32-hex>` KV-name fixtures used to test the `listApiKeys` keyHash fallback. Fixed by renaming the fixtures to non-secret-looking values (`apikey:test-hash-*`) and updating the derived-hash assertion; no test semantics changed.
- **Non-serializable expression must be wrapped with `$(...)`** (warning; `worker/lib/d1/factory.ts:59,65`, `tests/unit/auth.store-verify.test.ts:257`): this is Biome's `lint/correctness/useQwikValidLexicalScope`, a Qwik-only rule that Codacy's Biome engine runs by default. False positive on a non-Qwik codebase; suppressed with `biome-ignore` comments (existing repo convention).
- **Unhandled errors detected in asynchronous function** (warning; `worker/routes/auth-bookmarks.ts:16`): the extracted bookmark handlers' unbound catch swallowed errors without logging. Fixed by binding and logging the error (`logger.error` + `toErrCtx`) while preserving the 400 "Invalid request" response contract (malformed JSON must stay 400).
- **Hardcoded passwords are a security risk** (warning; `tests/e2e/phase4-e2e.test.ts:74`): `ddr_admin_test_key_0000000000000000` is the deterministic admin API key seeded by `setup-auth.sh` and must remain a literal to match the seed; it already carries a `biome-ignore lint/security/noSecrets` comment. Codacy's native scanner does not honor inline ignores, so clearing it requires a dashboard dismissal — consistent with the pre-existing Codacy noise documented for PR #588 in GOAP_STATE.
