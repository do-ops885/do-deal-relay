---
name: console-to-logger
description: Migrate console.* calls to structured logging. Use for production code quality, log aggregation, and debugging across Cloudflare Workers and Node.js applications.
---

# Console to Structured Logger Migration

Replace `console.error/warn/log` calls with structured logger that provides better filtering, querying, and debugging in production.

## When to Use

- Migrating from development to production
- Setting up log aggregation (Cloudflare Workers Logs, Datadog, etc.)
- Improving debugging capabilities
- Before production deployment of new services

## Quick Start

```typescript
// BEFORE:
console.error("Cache get error:", error);
console.warn("Rate limit approaching");
console.log("Processing request");

// AFTER:
logger.error("Cache get error", {
  component: "cache",
  error: error instanceof Error ? error.message : String(error),
});
logger.warn("Rate limit approaching", { component: "rate-limit" });
logger.info("Processing request", { component: "api" });
```

## Two-Step Procedure

### Step 1: Identify Files to Fix

```bash
# Find all console.* calls in worker code (excluding logger infrastructure):
grep -rn "console\.\(log\|warn\|error\|info\)(" src/ --include="*.ts" | \
  grep -v "logger/structured.ts" | \
  grep -v "global-logger.ts"
```

### Step 2: Replace with Structured Logger

For each file:

1. **Add import** (if not already present):
```typescript
import { logger } from "../lib/global-logger";
// Adjust relative path based on file location
```

2. **Replace console.* calls**:
```typescript
// BEFORE:
console.error("Operation failed:", error);

// AFTER:
logger.error("Operation failed", {
  component: "module-name",
  error: error instanceof Error ? error.message : String(error),
});
```

3. **Add component field** to help with debugging:
```typescript
logger.error("Cache get error", { component: "cache", key, error: err.message });
logger.warn("No active lock found", { component: "lock" });
logger.info("Pipeline completed", { component: "pipeline", deals: count });
```

## Rules

1. **Never modify logger infrastructure** - `structured.ts` and `global-logger.ts` ARE the logger
2. **Always add component field** - Helps filter logs by module in production
3. **Use correct log level**:
   - `logger.error()` - Errors that need immediate attention
   - `logger.warn()` - Unexpected conditions that don't stop execution
   - `logger.info()` - Normal operation events
   - `logger.debug()` - Detailed debugging information
4. **Preserve error context** - Use `error instanceof Error ? error.message : String(error)`
5. **Keep comments that explain WHY** - Remove only the console.* call

## Common Patterns

### Pattern A: Error Logging
```typescript
// BEFORE:
console.error("Failed to fetch:", error);

// AFTER:
logger.error("Failed to fetch", {
  component: "api-fetcher",
  url,
  error: error instanceof Error ? error.message : String(error),
});
```

### Pattern B: Warning Logging
```typescript
// BEFORE:
console.warn("Cache miss for key:", key);

// AFTER:
logger.warn("Cache miss", { component: "cache", key });
```

### Pattern C: Info Logging
```typescript
// BEFORE:
console.log("Server started on port:", port);

// AFTER:
logger.info("Server started", { component: "server", port });
```

### Pattern D: Fallback in Logger Itself
```typescript
// These should KEEP console.* (they ARE the logger):
// logger/structured.ts
// global-logger.ts
```

## Verification

```bash
# Should return 0 results after fix (excluding logger infrastructure):
grep -rn "console\.\(log\|warn\|error\)(" src/ --include="*.ts" | \
  grep -v "logger/structured.ts" | \
  grep -v "global-logger.ts"
```

## Component Naming Convention

Use lowercase kebab-case matching the module/directory name:
- `worker/lib/cache.ts` → `component: "cache"`
- `worker/lib/rate-limit.ts` → `component: "rate-limit"`
- `worker/routes/api/deals.ts` → `component: "deals-api"`
- `worker/pipeline/discover.ts` → `component: "pipeline"`

## Rationalizations

- **Structured over unstructured**: `console.*` produces unstructured text that is hard to filter, query, or alert on. Structured logging with key-value pairs enables efficient production debugging.
- **Component field required**: Every log entry includes a `component` field so operators can filter logs by module without grep gymnastics.
- **Preserve error context**: Using `error instanceof Error ? error.message : String(error)` ensures logs always contain actionable error text regardless of thrown type.
- **Two-step procedure**: Identify-then-replace reduces risk of regressions; verification grep confirms completeness.

## Red Flags

- Modifying `structured.ts` or `global-logger.ts` — these ARE the logger infrastructure.
- Dropping the `component` field — makes logs unfilterable in production.
- Using `console.*` inside new code — all new code must use `logger` from the start.
- Logging sensitive data (tokens, passwords, PII) in log values.
