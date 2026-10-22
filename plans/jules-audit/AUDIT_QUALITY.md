# Track B: Code Quality

## Findings
1. **`worker/routes/admin/keys.ts`**:
   - Untyped `body.role as any` assertion used when validating key roles.
   - Magic numbers `60` (`requestsPerMinute`) and `1000` (`requestsPerHour`) in default rate limit config.

## Actions Planned
- Replace `body.role as any` with `as (typeof ALLOWED_API_KEY_ROLES)[number]` in `worker/routes/admin/keys.ts`.
- Extract `DEFAULT_API_KEY_REQUESTS_PER_MINUTE = 60` and `DEFAULT_API_KEY_REQUESTS_PER_HOUR = 1000` constants in `worker/routes/admin/keys.ts`.
