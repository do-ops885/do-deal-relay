# Track B — Code Quality Audit (2026-09-20)

## Findings
- **Magic Number in `worker/routes/auth.ts`**:
  The integer literal `86400` was hardcoded twice in `registerUser` (line 346) and `refreshAccessToken` (line 412) when constructing token responses with `expiresIn: 86400`.

## Changes Applied
- Extracted `export const JWT_EXPIRATION_SECONDS = 86400;` constant at module level in `worker/routes/auth.ts`.
- Replaced hardcoded `86400` literals with `JWT_EXPIRATION_SECONDS`.
