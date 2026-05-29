# ADR-010: User Management and Authentication Database Schema

## Context
As the `do-deal-relay` system matures, there is a need for a more robust user management and authentication system. While ADR-008 introduced basic API key authentication via KV, a relational database (D1) approach is required to support complex Role-Based Access Control (RBAC), user sessions, and comprehensive audit logging.

## Decision
Implement a relational schema in D1 to manage users, API keys, sessions, and RBAC.

### Schema Design

#### Users
The `users` table will be the central entity for identity.
- `id`: Unique identifier (UUID).
- `email`: Unique email address.
- `name`: User's full name.
- `password_hash`: Securely hashed password.
- `role`: Default role (e.g., 'viewer', 'user', 'admin').
- `is_active`: Boolean flag for account status.
- `created_at`, `updated_at`: Timestamps.

#### API Keys
The `api_keys` table will manage long-lived keys for programmatic access, linked to users.
- `id`: Unique identifier.
- `user_id`: Reference to `users(id)`.
- `key_hash`: Hashed API key (plaintext key is never stored).
- `name`: Human-readable name for the key.
- `permissions`: JSON array of specific permissions granted to this key.
- `last_used_at`, `expires_at`, `created_at`: Timestamps.

#### Sessions
The `sessions` table will manage short-lived authentication tokens for web-based access.
- `id`: Unique session identifier (token).
- `user_id`: Reference to `users(id)`.
- `expires_at`: Expiration timestamp.
- `created_at`: Timestamp when session was created.

#### RBAC (Roles & Permissions)
To support granular access control:
- `roles`: Defined roles in the system.
- `permissions`: Defined actions that can be performed (e.g., `deals:create`, `referrals:delete`).
- `role_permissions`: Join table mapping roles to permissions.

#### Audit Log
Enhanced audit logging for security and compliance.
- `id`: Unique identifier.
- `user_id`: Reference to `users(id)` (optional, for system actions).
- `action`: The action performed.
- `resource`: The resource affected.
- `ip_address`: Originating IP.
- `user_agent`: User agent of the client.
- `created_at`: Timestamp.

### Implementation Strategy
1. Update `worker/db/schema.sql` for new installations.
2. Implement a new migration (Version 7) in `worker/lib/d1/migrations.ts` to upgrade existing databases.
3. Align existing authentication logic in `worker/lib/auth.ts` to utilize these tables while maintaining backward compatibility with KV-based keys where appropriate during transition.

## Consequences
- Enables granular access control.
- Provides better visibility into system actions via audit logs.
- Simplifies user management and session handling.
- Requires D1 connectivity for all authenticated requests (already common in the current architecture).
