# ADR-008: API Authentication and Authorization

## Context
All API endpoints in the `do-deal-relay` service were found to be completely unauthenticated. This includes sensitive operations like deal creation, referral management, and research triggers, as well as data-sensitive listing endpoints.

## Decision
Implement a comprehensive API key-based authentication and authorization system using Cloudflare KV for storage and middleware for enforcement.

### Authentication Mechanism
- API keys will follow the format `ddr_<random32chars>_<timestamp>`.
- API keys will never be stored in plaintext. Instead, a SHA-256 hash of the key will be used as the KV key.
- Keys can be provided via `Authorization: Bearer <key>` or `X-API-Key: <key>` headers.

### Authorization Model
- Three roles will be supported:
  - `admin`: Full access to all endpoints, including API key management and system metrics.
  - `user`: Access to submission, research, and standard referral operations.
  - `readonly`: Access to list and view data, but no modification rights.

### Storage
- API key metadata will be stored in the `DEALS_SOURCES` KV namespace (or `WEBHOOK_API_KEYS` if available).
- Metadata includes: `userId`, `role`, `createdAt`, `expiresAt`, `lastUsed`, and `rateLimit` configurations.

### Middleware
- A `withAuth` higher-order function and `requireAuth` middleware will be used to wrap route handlers.
- Rate limiting will be integrated with authentication to allow per-user/per-key quotas.

### API Key Management
- New admin-only endpoints will be created for managing API keys:
  - `POST /api/admin/keys`: Create a new key.
  - `GET /api/admin/keys`: List all active keys.
  - `DELETE /api/admin/keys/:hash`: Revoke a key.

## Consequences
- All API clients must now provide a valid API key.
- Improved security posture by preventing unauthorized access and potential SSRF via the research agent.
- Ability to track usage and enforce rate limits on a per-user basis.
- Slight increase in latency due to KV lookups for authentication (mitigated by KV's global distribution).
