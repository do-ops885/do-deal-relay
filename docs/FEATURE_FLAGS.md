# Feature Flags System

The Feature Flags system provides feature toggle functionality without redeployment. Supports boolean flags, percentage rollouts, and user-specific flags. Uses Cloudflare KV for persistence.

## Overview

Feature flags allow you to:
- Enable/disable features without deploying new code
- Roll out features gradually to a percentage of users
- Target specific users for early access
- A/B test features with different user groups

## Installation

The feature flags module is already included in the worker:

```typescript
import {
  isFeatureEnabled,
  getFeatureFlag,
  setFeatureFlag,
  deleteFeatureFlag,
  initializeDefaultFlags,
} from "./lib/feature-flags";
```

## API

### Check if Feature is Enabled

```typescript
const enabled = await isFeatureEnabled("new-dashboard", env);
if (enabled) {
  return renderNewDashboard();
}
```

**With user targeting:**

```typescript
const enabled = await isFeatureEnabled("beta-feature", env, "user-123");
```

### Get Feature Flag Configuration

```typescript
const flag = await getFeatureFlag("new-feature", env);
console.log(flag?.enabled);
console.log(flag?.rolloutPercentage);
console.log(flag?.userIds);
```

### Set Feature Flag

```typescript
// Basic boolean flag
await setFeatureFlag({
  name: "new-feature",
  enabled: true,
}, env);

// Flag with percentage rollout
await setFeatureFlag({
  name: "new-feature",
  enabled: true,
  rolloutPercentage: 50, // 50% of users
}, env);

// Flag for specific users
await setFeatureFlag({
  name: "beta-feature",
  enabled: true,
  userIds: ["user-1", "user-2", "user-3"],
}, env);

// Flag with description
await setFeatureFlag({
  name: "new-dashboard",
  enabled: true,
  description: "New dashboard redesign",
}, env);
```

### Delete Feature Flag

```typescript
await deleteFeatureFlag("old-feature", env);
```

### Initialize Default Flags

Automatically creates default feature flags on first run:

```typescript
await initializeDefaultFlags(env);
```

## Default Flags

The system initializes with these default flags (ADR-032 — every flag names
its enforcement point; flags are seeded lazily on first read):

| Flag | Default | Enforcement Point |
|------|---------|-------------------|
| `bulk_import_export` | Enabled (kill switch) | `POST /api/bulk/import`, `GET /api/bulk/export` |
| `email_processing` | Enabled (kill switch) | `/api/email/*` |
| `analytics_dashboard` | Enabled (kill switch) | `/api/analytics*`, `/api/dashboard/*` |
| `webhook_system` | Enabled (kill switch) | `/webhooks/*` |
| `nlq_ai_enhancement` | Enabled (kill switch) | NLQ hybrid classifier AI path (rule fallback) |
| `ai_extractor_scraper` | **Disabled (fail-closed)** | Research-agent `extractWithAI` — off unless enabled via admin API |
| `real_research_fetching` | Enabled (100%) | Research-agent orchestrator real fetching |
| `workflow_shadow_discovery` | Disabled | Shadow discovery workflow trigger |
| `workflow_pipeline_cutover` | Disabled | Durable pipeline workflow trigger |

> **Behavior change (ADR-032)**: `ai_extractor_scraper` is now enforced
> fail-closed. Workers AI extraction in the research agent is OFF until an
> admin enables the flag — previously it ran unconditionally whenever the AI
> binding was present.

## Enforcement (ADR-032)

Route-level gates use the `requireFeature` middleware
(`worker/middleware/feature-gate.ts`). A disabled flag returns
`503 FEATURE_DISABLED` with a machine-readable body:

```json
{ "error": "Feature disabled", "code": "FEATURE_DISABLED", "feature": "bulk_import_export" }
```

503 (not 404) is used because the endpoints are publicly documented; the
explicit code matches the existing `REMOTE_BINDING_REQUIRED` pattern.

## Admin API

Operators manage flags at runtime (admin role required, JWT bearer):

```bash
# List all flags (defaults are seeded lazily on first call)
curl -H "Authorization: Bearer $ADMIN_JWT" https://your-worker.workers.dev/api/admin/flags

# Flip a flag (partial update; unknown fields are rejected)
curl -X PUT -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' \
  https://your-worker.workers.dev/api/admin/flags/email_processing
```

- `GET /api/admin/flags` — list every flag (sorted)
- `PUT /api/admin/flags/:name` — update `enabled`, `rolloutPercentage`,
  `userIds`, and/or `description`. Unknown flag names return
  `404 FLAG_NOT_FOUND` so typos cannot create junk flags.

## Usage Patterns

### Middleware Pattern

Protect routes with the feature-gate middleware (ADR-032):

```typescript
import { requireFeature } from "../middleware/feature-gate";

// Inside a router branch — returns 503 FEATURE_DISABLED when off:
const featureOff = await requireFeature("new-feature", request, env);
if (featureOff) return featureOff;
```

### Conditional Feature Rendering

```typescript
async function handleRequest(req: Request, env: Env) {
  const showNewUI = await isFeatureEnabled("new-ui", env);

  if (showNewUI) {
    return renderNewUI();
  }
  return renderLegacyUI();
}
```

### Percentage Rollout

```typescript
// 25% rollout
await setFeatureFlag({
  name: "ai-search",
  enabled: true,
  rolloutPercentage: 25,
}, env);

// User gets consistent results (same user always gets same result)
const enabled = await isFeatureEnabled("ai-search", env, "user-123");
```

### User-Specific Flags

```typescript
// Enable for specific users (e.g., beta testers)
await setFeatureFlag({
  name: "beta-dashboard",
  enabled: true,
  userIds: ["user-1", "user-2", "user-3"],
}, env);

// Only these users will see the feature
const canAccess = await isFeatureEnabled("beta-dashboard", env, "user-1"); // true
const cannotAccess = await isFeatureEnabled("beta-dashboard", env, "user-99"); // false
```

### Batch Checking

Check multiple flags efficiently:

```typescript
const results = await batchCheckFlags(
  ["feature-a", "feature-b", "feature-c"],
  env,
  "user-123"
);

if (results.get("feature-a")) {
  // feature a is enabled
}
```

## Admin API Endpoints

Admin endpoints require an Admin role (JWT Bearer token or Admin API key).

### List All Feature Flags

List all feature flags. Defaults are lazily seeded in KV on first access if not present (ADR-032).

```bash
GET /api/admin/flags
```

**Headers:**
- `Authorization: Bearer <admin_access_token>` or `X-API-Key: <admin_key>`

**Response (200 OK):**
```json
{
  "flags": [
    {
      "name": "bulk_import_export",
      "enabled": true,
      "description": "Kill switch for bulk import/export endpoints",
      "createdAt": "2026-10-05T00:00:00.000Z",
      "updatedAt": "2026-10-05T00:00:00.000Z"
    }
  ],
  "count": 9
}
```

---

### Update Feature Flag

Update feature flag configuration via partial update. Unknown flag names return `404 FLAG_NOT_FOUND` to prevent typo pollution.

```bash
PUT /api/admin/flags/:name
Content-Type: application/json
```

**Headers:**
- `Authorization: Bearer <admin_access_token>` or `X-API-Key: <admin_key>`

**Parameters:**
- `name` (string): Flag identifier (`a-z0-9_`, max 64 chars)

**Request Body:**
```json
{
  "enabled": false,
  "rolloutPercentage": 25,
  "userIds": ["user-1"],
  "description": "Updated feature flag description"
}
```

All body fields are optional; at least one field must be provided. `rolloutPercentage` must be an integer between 0 and 100.

**Response (200 OK):**
```json
{
  "flag": {
    "name": "email_processing",
    "enabled": false,
    "createdAt": "2026-10-05T00:00:00.000Z",
    "updatedAt": "2026-10-05T01:00:00.000Z"
  }
}
```

**Status Codes:**
- 200: Flag updated successfully
- 400: Invalid flag name or invalid body payload
- 401: Unauthorized (missing or invalid token)
- 403: Forbidden (Admin role required)
- 404: `FLAG_NOT_FOUND` - flag name is unknown

## Examples

### Gradual Rollout

```typescript
// Start with 0% and increase gradually
await setFeatureFlag({
  name: "new-recommendation-engine",
  enabled: true,
  rolloutPercentage: 0,
}, env);

// After testing, increase to 10%
await setFeatureFlag({
  name: "new-recommendation-engine",
  enabled: true,
  rolloutPercentage: 10,
}, env);

// Monitor metrics, increase as confidence grows
// 25% -> 50% -> 75% -> 100%
```

### Kill Switch

```typescript
// Emergency disable a feature
await setFeatureFlag({
  name: "problematic-feature",
  enabled: false,
}, env);
```

### A/B Testing

```typescript
// Feature B for 50% of users
await setFeatureFlag({
  name: "feature-b",
  enabled: true,
  rolloutPercentage: 50,
}, env);

// In your handler
const useFeatureB = await isFeatureEnabled("feature-b", env, userId);
if (useFeatureB) {
  return handleFeatureB();
}
return handleFeatureA();
```

## Best Practices

1. **Use descriptive names**: `new-dashboard` is better than `flag1`
2. **Add descriptions**: Help other developers understand the flag's purpose
3. **Clean up old flags**: Remove flags after full rollout
4. **Monitor rollout**: Track metrics before and after enabling
5. **Use consistent hashing**: Same user always gets same result for percentage rollouts

## Troubleshooting

### Flag not found

Returns `false` for non-existent flags:

```typescript
const enabled = await isFeatureEnabled("non-existent", env);
// enabled === false
```

### KV Errors

The system fails gracefully - returns `false` on KV errors:

```typescript
try {
  const enabled = await isFeatureEnabled("any-flag", env);
} catch {
  // Won't throw - returns false on error
}
```

## Integration with Rate Limiting

Feature flags can be combined with rate limiting for better control:

```typescript
const featureEnabled = await isFeatureEnabled("premium-feature", env, userId);
if (!featureEnabled) {
  return new Response("Feature not available", { status: 403 });
}

const rateLimitOk = await checkRateLimitKV(env, userId, 100, 60);
if (!rateLimitOk.allowed) {
  return new Response("Rate limited", { status: 429 });
}
```
