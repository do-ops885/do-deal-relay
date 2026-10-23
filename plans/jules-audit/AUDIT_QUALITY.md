# Code Quality Audit

## Findings

- **File**: `worker/routes/admin/keys.ts`
  - **Issue 1**: Untyped `as any` assertion in `body.role as any`.
  - **Issue 2**: Magic numbers `60` (requestsPerMinute) and `1000` (requestsPerHour) in `handleCreateApiKey` default rate limit configuration.

## Actionable Changes
Refactor `worker/routes/admin/keys.ts` to:
1. Extract named constants `DEFAULT_API_KEY_REQUESTS_PER_MINUTE = 60` and `DEFAULT_API_KEY_REQUESTS_PER_HOUR = 1000`.
2. Replace `body.role as any` with strongly-typed role casting `as (typeof ALLOWED_API_KEY_ROLES)[number]`.
