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
const enabled = await isFeatureFlag("new-dashboard", env);
if (enabled) {
  return renderNewDashboard();
}
```

**With user targeting:**

```typescript
const enabled = await isFeatureFlag("beta-feature", env, "user-123");
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

The system initializes with these default flags:

| Flag | Default | Description |
|------|---------|-------------|
| `bulk_import_export` | Disabled | Enable bulk import/export endpoints |
| `nlq_ai_enhancement` | Enabled | Enable AI-powered NLQ enhancement |
| `email_processing` | Disabled | Enable email API endpoints |
| `analytics_dashboard` | Enabled | Enable analytics endpoints |
| `webhook_system` | Enabled | Enable webhook endpoints |

## Usage Patterns

### Middleware Pattern

Protect routes with feature flags:

```typescript
import { createFeatureFlagMiddleware } from "./lib/feature-flags";

// Create middleware for a specific flag
const newFeatureMiddleware = createFeatureFlagMiddleware(
  env,
  "new-feature"
);

// Use with route handler
app.use("/api/new", newFeatureMiddleware, handleNewFeature);
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

### List All Flags

```bash
GET /api/flags
```

Response:
```json
{
  "flags": [
    {
      "name": "new-feature",
      "enabled": true,
      "rolloutPercentage": 50,
      "description": "New feature description",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Get Single Flag

```bash
GET /api/flags/:name
```

### Set Flag

```bash
PUT /api/flags/:name
Content-Type: application/json

{
  "enabled": true,
  "rolloutPercentage": 25,
  "userIds": ["user-1", "user-2"],
  "description": "Feature description"
}
```

### Delete Flag

```bash
DELETE /api/flags/:name
```

### Get Stats

```bash
GET /api/flags/stats
```

Response:
```json
{
  "totalFlags": 5,
  "enabledFlags": 3,
  "disabledFlags": 2,
  "flagsWithRollout": 1,
  "flagsWithUserIds": 1
}
```

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
