# Code Quality Audit - 2026-09-17

## Magic Numbers
- `worker/routes/auth.ts`: Unextracted magic number `86400` (seconds in 24 hours) used in JWT response payloads (`loginUser` and `refreshAccessToken`).

## Recommended Refactoring
- Extract `86400` to a named constant `JWT_EXPIRATION_SECONDS = 86400` in `worker/routes/auth.ts`.
