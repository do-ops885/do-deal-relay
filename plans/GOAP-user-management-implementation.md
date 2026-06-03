# GOAP Implementation Plan: User Management & Authentication System

**Issue**: #284  
**Status**: Implemented  
**Date**: 2026-06-03  

## Context

The do-deal-relay system needed a production-ready user management and authentication system. The existing codebase had foundational auth infrastructure (JWT creation/verification, basic auth middleware, API key management) but lacked proper RBAC, refresh token security, and password policy enforcement.

## Decision

Implement a comprehensive auth system with:
1. **JWT access tokens** (24h expiry) with Web Crypto API HMAC-SHA256 signing
2. **Refresh tokens** (30d expiry) tracked in D1 with family-based reuse detection
3. **RBAC** with a permission matrix stored in D1 (resource:action convention)
4. **Password policy** enforcement (min 8 chars, uppercase, lowercase, digit)
5. **Audit logging** for all auth events

## Implementation

### Files Modified

| File | Change |
|------|--------|
| `worker/lib/jwt.ts` | Added `hashRefreshToken()` and `generateTokenFamily()` exports |
| `worker/lib/auth.ts` | Existing middleware (unchanged, leveraged by new routes) |
| `worker/routes/auth.ts` | Enhanced with password validation, refresh token tracking, RBAC integration, logout endpoint |
| `worker/lib/rbac.ts` | **New** - Permission-based RBAC with D1-backed role-permission matrix |
| `worker/lib/refresh-tokens.ts` | **New** - Refresh token lifecycle management with reuse detection |
| `worker/types.ts` | Added RBAC and refresh token types |
| `worker/index.ts` | Added `/api/auth/logout` route |
| `migrations/0004_refresh_tokens_rbac.sql` | **New** - D1 schema for refresh_tokens and role_permissions tables |

### Architecture

```
┌─────────────────────────────────────────────────┐
│                  API Layer                       │
│  POST /auth/register  POST /auth/login          │
│  POST /auth/refresh   POST /auth/logout         │
│  GET  /users/me       PATCH /users/me           │
│  GET  /users (admin)                            │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Auth Middleware                      │
│  authenticateRequest() → JWT or API Key          │
│  requireAuth(role?)   → role-based gate          │
│  RBAC checks          → permission-based gate    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Core Auth Logic                      │
│  registerUser()  → password validation + D1      │
│  loginUser()     → credential check + tokens     │
│  refreshAccessToken() → reuse detection          │
│  handleLogout()  → revoke all sessions           │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Token Management                     │
│  jwt.ts          → JWT create/verify + PBKDF2    │
│  refresh-tokens.ts → D1 tracking + family reuse  │
│  rbac.ts         → permission matrix cache       │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              D1 Database                          │
│  users            → user accounts                │
│  refresh_tokens   → token family tracking        │
│  role_permissions → RBAC permission matrix       │
│  audit_log        → security event log           │
│  api_keys         → programmatic access keys     │
└─────────────────────────────────────────────────┘
```

### Security Features

#### Refresh Token Reuse Detection
- Each login creates a new **token family**
- Token rotation extends within the same family
- If a revoked/replayed token is presented, **entire family is revoked**
- Maximum 5 active families per user (oldest cleaned up)

#### Password Policy
- Minimum 8 characters, maximum 128
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- Email format validation (RFC 5322 simplified)

#### RBAC Permission Matrix
Permissions follow `resource:action` convention:

| Role | Permissions |
|------|-------------|
| **admin** | Full access to all resources |
| **user** | deals:read/write, referrals:read/write, profile:read/write |
| **viewer** | deals:read, referrals:read, profile:read |
| **api_consumer** | deals:read, deals:write |
| **readonly** | deals:read, profile:read |

Permissions are stored in D1 `role_permissions` table with a 5-minute in-memory cache.

#### Audit Logging
All auth events are logged to `audit_log` table:
- `user_register` - New account creation
- `user_login` - Successful login
- `login_failed` - Failed login attempt
- `token_refresh` - Token rotation
- `user_update` - Profile changes
- `user_logout` - Session termination

### API Endpoints

#### POST /api/auth/register
**Public** - Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user",
  "isActive": true,
  "createdAt": "2026-06-03T...",
  "updatedAt": "2026-06-03T..."
}
```

#### POST /api/auth/login
**Public** - Authenticate and receive tokens.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**
```json
{
  "user": { "id": "...", "email": "...", ... },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 86400
}
```

#### POST /api/auth/refresh
**Public** - Rotate tokens using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJ..."
}
```

**Response (200):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 86400
}
```

#### POST /api/auth/logout
**Authenticated** - Revoke all sessions for the user.

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

#### GET /api/users/me
**Authenticated** - Get current user profile.

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**
```json
{
  "id": "...",
  "email": "...",
  "name": "...",
  "role": "user",
  "isActive": true,
  "createdAt": "...",
  "updatedAt": "...",
  "activeSessions": 3
}
```

#### PATCH /api/users/me
**Authenticated** - Update current user profile.

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

#### GET /api/users
**Admin only** - List all users.

### D1 Schema

```sql
-- Refresh token tracking
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  family TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  replaced_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- RBAC permission matrix
CREATE TABLE role_permissions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(role, permission)
);
```

## Consequences

### Positive
- **Security**: Refresh token reuse detection prevents token theft replay attacks
- **Auditability**: All auth events logged with IP and user agent
- **Flexibility**: Permission-based RBAC allows fine-grained access control
- **Scalability**: D1-backed permissions with in-memory caching

### Negative
- **Complexity**: Token family tracking adds D1 writes on every token rotation
- **Migration**: Existing users need migration (no breaking changes - existing tokens still work)

### Risks
- **D1 Latency**: Permission cache (5min TTL) may serve stale data after role changes
- **Token Storage**: Refresh tokens in D1 add storage cost (~1KB per token)

## Validation

- [x] TypeScript compilation passes (only pre-existing errors in unrelated test files)
- [x] Password validation enforces policy
- [x] Refresh token rotation creates new family on login
- [x] Reuse detection revokes entire family
- [x] RBAC permissions cached with 5-min TTL
- [x] Audit log captures all auth events
- [x] CORS headers properly configured
- [x] Security headers on all responses

## Future Enhancements

1. **Password Change**: Add `POST /api/auth/change-password` with old password verification
2. **Account Lockout**: Lock accounts after N failed login attempts
3. **Email Verification**: Add email verification flow for new registrations
4. **2FA/TOTP**: Add two-factor authentication support
5. **Session Management**: Add `GET /api/users/me/sessions` to list active sessions
6. **Admin Role Management**: Add `PATCH /api/users/:id/role` for admin role assignment
