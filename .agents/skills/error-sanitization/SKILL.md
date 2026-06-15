---
name: error-sanitization
description: Replace unsafe error patterns with safe error handling. Use for security hardening, error message leakage prevention, and consistent error handling across TypeScript codebases.
---

# Error Sanitization

Replace unsafe `(error as Error).message` patterns with safe error handling that prevents information leakage to API clients.

## When to Use

- Security hardening of API endpoints
- Error message leakage prevention
- Consistent error handling across large codebases
- Before production deployment of new services

## Quick Start

```typescript
// 1. Create sanitize-error.ts utility
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error(String(error));
}

// 2. Replace unsafe casts
// BEFORE:
(error as Error).message

// AFTER:
toError(error).message

// 3. Sanitize HTTP responses
// BEFORE:
return jsonResponse({ error: "Failed", message: error.message }, 500);

// AFTER:
return jsonResponse({ error: "Failed to retrieve data" }, 500);
```

## Three-Step Procedure

### Step 1: Create Utility

Create `lib/sanitize-error.ts` with:

```typescript
import { logger } from "./global-logger";

export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  if (error !== null && typeof error === "object") {
    try { return new Error(JSON.stringify(error)); }
    catch { return new Error(String(error)); }
  }
  return new Error(String(error));
}

export function sanitizeErrorForClient(
  error: unknown,
  context?: { component?: string; handler?: string }
): { error: string } {
  const err = toError(error);
  logger.error("Unhandled error", {
    component: context?.component || "unknown",
    handler: context?.handler,
    error_message: err.message,
    error_stack: err.stack,
  });
  return { error: "An unexpected error occurred" };
}
```

### Step 2: Replace Unsafe Casts

Find all instances:
```bash
grep -rn "(error as Error)\.message" src/
grep -rn "(err as Error)\.message" src/
```

Replace each with:
```typescript
// For internal logging (safe):
toError(error).message

// For HTTP responses (sanitized):
return jsonResponse({ error: "Failed to [operation]" }, 500);
```

### Step 3: Remove Error Messages from HTTP Responses

Find leaked error messages:
```bash
grep -rn "message:.*error\.message" src/routes/
grep -rn "message:.*err\.message" src/routes/
```

Replace with generic messages:
```typescript
// BEFORE:
{ error: "Failed", message: err.message }

// AFTER:
{ error: "Failed to retrieve referrals" }
```

## Rules

1. **Internal logging preserves error.message** - Only HTTP response bodies are sanitized
2. **Generic messages for clients** - Use "Failed to [operation]" pattern
3. **Import path consistency** - Use `../lib/sanitize-error` or `../../lib/sanitize-error`
4. **Keep handleError() calls** - Only remove `message` from response JSON
5. **Never expose stack traces** - Remove from all client-facing responses

## Common Patterns

### Pattern A: Route Handler Catch Block
```typescript
} catch (error) {
  const err = handleError(error, { component: "api", handler: "handleGetItems" });
  return jsonResponse({ error: "Failed to retrieve items" }, 500, request, env);
}
```

### Pattern B: Internal Pipeline Error
```typescript
} catch (error) {
  const err = toError(error);
  throw new PipelineError("SystemError", err.message, "phase", true);
}
```

### Pattern C: Webhook Signature Verification
```typescript
if (!verification.valid) {
  return jsonResponse({ error: "Invalid webhook signature" }, 401, request, env);
  // NEVER include verification.error which contains timing details
}
```

## Verification

```bash
# Should return 0 results after fix:
grep -rn "(error as Error)\.message" src/
grep -rn "message:.*error\.message" src/routes/
grep -rn "message:.*err\.message" src/routes/
```

## Rationalizations

- **Type safety**: `(error as Error)` is an unsafe type assertion that crashes on non-Error throws (e.g., `string`, `null`, plain objects). `toError()` handles all types safely.
- **Information leakage**: Exposing `error.message` or `error.stack` in HTTP responses leaks internal implementation details to attackers.
- **Consistency**: A single `toError()` utility ensures every catch block handles unknown error types the same way.
- **Defense in depth**: Sanitizing at the response boundary (not just the logging boundary) prevents accidental leakage through future code changes.

## Red Flags

- Using `(error as Error)` anywhere — always use `toError(error)` instead.
- Including `error.message` or `err.message` in HTTP response JSON bodies.
- Exposing `error.stack` or `err.stack` in client-facing responses.
- Skipping the `sanitizeErrorForClient()` helper for route handlers — every catch block in a route must sanitize.
