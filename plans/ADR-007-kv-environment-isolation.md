# ADR-007: KV Environment Isolation

## Context

The Deal Discovery System uses multiple Cloudflare KV namespaces for data storage, locking, and configuration. Currently, the `wrangler.jsonc` configuration uses the same KV namespace IDs for several bindings across both `staging` and `production` environments. Specifically:

- `DEALS_STAGING`, `DEALS_LOCK`, and `DEALS_SOURCES` share IDs between environments.
- The `staging` environment's `DEALS_PROD` binding points to the same ID as the `production` environment's `DEALS_STAGING` binding.

This creates a high risk of:
- Data corruption: Staging tests modifying production data.
- Stale cache: Cache entries from one environment being visible in another.
- Configuration leaks: Source registry changes in staging affecting production.
- Security risks: Sensitive data from production being accessible in staging.

## Decision

We will enforce strict environment isolation by requiring unique KV namespaces for each environment (Development, Staging, Production).

1. **Unique IDs in `wrangler.jsonc`**: Every KV namespace binding in each environment section of `wrangler.jsonc` must have a unique ID.
2. **Environment Tagging**: Every KV namespace will be seeded with a metadata key `__KV_ENVIRONMENT__` containing the name of the intended environment (e.g., "staging", "production").
3. **Runtime Validation**: The worker will validate at startup that the `__KV_ENVIRONMENT__` stored in its bound namespaces matches its own `ENVIRONMENT` variable.

## Implementation Strategy

### 1. Configuration Update
Update `wrangler.jsonc` to use unique placeholder IDs for staging if real ones aren't available, or ensure separate real IDs are used. Top-level `kv_namespaces` (which apply to production by default if not overridden) will be kept, but `env.production` and `env.staging` will explicitly define all bindings to ensure clarity.

### 2. Runtime Check
Modify `worker/lib/config-utils.ts` to include a check:
```typescript
async function validateKVIsolation(env: Env) {
  const namespaces = [env.DEALS_PROD, env.DEALS_STAGING, env.DEALS_LOG, env.DEALS_LOCK, env.DEALS_SOURCES];
  for (const kv of namespaces) {
    const kvEnv = await kv.get("__KV_ENVIRONMENT__");
    if (kvEnv && kvEnv !== env.ENVIRONMENT) {
      throw new Error(`KV Namespace Environment Mismatch: Expected ${env.ENVIRONMENT}, got ${kvEnv}`);
    }
  }
}
```
*Note: This check will be async, so it must be handled carefully in the `fetch` handler or ignored if the key is missing (to allow for migration).*

### 3. Seeding Scripts
Update `scripts/seed-kv.sh` and `scripts/seed-local-kv.sh` to set the `__KV_ENVIRONMENT__` key.

## Consequences

- **Pros**:
  - Eliminates cross-environment data corruption.
  - Improves security and reliability.
  - Clearer separation of concerns.
- **Cons**:
  - Requires management of more KV namespaces (5 per environment).
  - Increased setup complexity for new environments.
  - Startup latency increase due to isolation check (can be mitigated by caching or running only in non-production).
