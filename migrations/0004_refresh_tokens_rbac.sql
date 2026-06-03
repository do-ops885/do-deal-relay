-- ============================================================================
-- Migration 0004: Refresh Token Tracking & RBAC
-- ============================================================================
-- Adds refresh token family tracking for reuse detection and revocation.
-- Adds role_permissions table for fine-grained RBAC.
-- ============================================================================

-- ============================================================================
-- Refresh Tokens Table
-- ============================================================================
-- Tracks refresh token families for reuse detection and revocation.
-- Each login creates a new family; rotation extends the family.
-- If a revoked family token is used, all tokens in that family are revoked.

CREATE TABLE IF NOT EXISTS refresh_tokens (
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

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ============================================================================
-- Role Permissions Table
-- ============================================================================
-- Maps roles to their allowed permissions for fine-grained RBAC.
-- Permissions follow the pattern "resource:action" (e.g., "deals:read").

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(role, permission)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission);

-- ============================================================================
-- Seed Default Permissions
-- ============================================================================

-- Admin: full access
INSERT OR IGNORE INTO role_permissions (id, role, permission, created_at) VALUES
  ('perm_admin_deals_read', 'admin', 'deals:read', datetime('now')),
  ('perm_admin_deals_write', 'admin', 'deals:write', datetime('now')),
  ('perm_admin_deals_delete', 'admin', 'deals:delete', datetime('now')),
  ('perm_admin_users_read', 'admin', 'users:read', datetime('now')),
  ('perm_admin_users_write', 'admin', 'users:write', datetime('now')),
  ('perm_admin_users_delete', 'admin', 'users:delete', datetime('now')),
  ('perm_admin_apikeys_read', 'admin', 'apikeys:read', datetime('now')),
  ('perm_admin_apikeys_write', 'admin', 'apikeys:write', datetime('now')),
  ('perm_admin_apikeys_delete', 'admin', 'apikeys:delete', datetime('now')),
  ('perm_admin_audit_read', 'admin', 'audit:read', datetime('now')),
  ('perm_admin_pipeline_read', 'admin', 'pipeline:read', datetime('now')),
  ('perm_admin_pipeline_write', 'admin', 'pipeline:write', datetime('now')),
  ('perm_admin_metrics_read', 'admin', 'metrics:read', datetime('now')),
  ('perm_admin_config_read', 'admin', 'config:read', datetime('now')),
  ('perm_admin_config_write', 'admin', 'config:write', datetime('now'));

-- User: standard access
INSERT OR IGNORE INTO role_permissions (id, role, permission, created_at) VALUES
  ('perm_user_deals_read', 'user', 'deals:read', datetime('now')),
  ('perm_user_deals_write', 'user', 'deals:write', datetime('now')),
  ('perm_user_referrals_read', 'user', 'referrals:read', datetime('now')),
  ('perm_user_referrals_write', 'user', 'referrals:write', datetime('now')),
  ('perm_user_profile_read', 'user', 'profile:read', datetime('now')),
  ('perm_user_profile_write', 'user', 'profile:write', datetime('now'));

-- Viewer: read-only access
INSERT OR IGNORE INTO role_permissions (id, role, permission, created_at) VALUES
  ('perm_viewer_deals_read', 'viewer', 'deals:read', datetime('now')),
  ('perm_viewer_referrals_read', 'viewer', 'referrals:read', datetime('now')),
  ('perm_viewer_profile_read', 'viewer', 'profile:read', datetime('now'));

-- API Consumer: limited programmatic access
INSERT OR IGNORE INTO role_permissions (id, role, permission, created_at) VALUES
  ('perm_apiconsumer_deals_read', 'api_consumer', 'deals:read', datetime('now')),
  ('perm_apiconsumer_deals_write', 'api_consumer', 'deals:write', datetime('now'));
