import type { Migration } from "./types";

/**
 * Migrations 7-8: auth/permissions tables and updated_at + pipeline_locks.
 * Concatenated into the main MIGRATIONS array by schema.ts to preserve order.
 */
export const MIGRATIONS_PART_4: Migration[] = [
  {
    version: 7,
    name: "add_auth_tables",
    up: `
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'viewer',
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Roles table
      CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          created_at TEXT DEFAULT (datetime('now'))
      );

      -- Permissions table
      CREATE TABLE IF NOT EXISTS permissions (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          created_at TEXT DEFAULT (datetime('now'))
      );

      -- Role Permissions mapping
      CREATE TABLE IF NOT EXISTS role_permissions (
          role_id TEXT NOT NULL REFERENCES roles(id),
          permission_id TEXT NOT NULL REFERENCES permissions(id),
          PRIMARY KEY (role_id, permission_id)
      );

      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          expires_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
      );

      -- Enhanced API Keys table (migrating from old one if it exists)
      -- First, let's rename the old one if it exists
      -- Note: SQLite doesn't support RENAME TABLE IF EXISTS directly in all versions,
      -- but we can use a sequence of operations.

      CREATE TABLE IF NOT EXISTS api_keys_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          key_hash TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          permissions TEXT DEFAULT '[]',
          last_used_at TEXT,
          expires_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
      );

      -- If audit_log exists and has old schema, we might need to handle it.
      -- Re-creating audit_log with new schema
      DROP TABLE IF EXISTS audit_log_old;
      ALTER TABLE audit_log RENAME TO audit_log_old;

      CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          action TEXT NOT NULL,
          resource TEXT,
          resource_type TEXT,
          resource_id TEXT,
          details TEXT,
          ip_address TEXT,
          user_agent TEXT,
          correlation_id TEXT,
          created_at TEXT DEFAULT (datetime('now'))
      );

      -- Migrate old audit logs if possible (mapping actor_id to user_id)
      INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip_address, correlation_id, created_at)
      SELECT CAST(id AS TEXT), actor_id, action, resource_type, resource_id, details, ip_address, correlation_id, created_at
      FROM audit_log_old;

      DROP TABLE IF EXISTS audit_log_old;

      -- Populate users from old api_keys to maintain foreign key integrity (only if api_keys exists)
      INSERT OR IGNORE INTO users (id, email, name, password_hash, role, is_active)
      SELECT DISTINCT user_id, user_id || '@placeholder.com', 'Legacy User ' || user_id, 'LEGACY_MIGRATED', role, 1
      FROM api_keys
      WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='api_keys');

      -- Finalize api_keys (only if api_keys exists)
      INSERT INTO api_keys_new (id, user_id, key_hash, name, permissions, last_used_at, expires_at, created_at)
      SELECT CAST(id AS TEXT), user_id, key_hash, 'Migrated Key', '[]', last_used_at, expires_at, created_at
      FROM api_keys
      WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='api_keys');

      DROP TABLE IF EXISTS api_keys;
      ALTER TABLE api_keys_new RENAME TO api_keys;

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_audit_user;
      DROP INDEX IF EXISTS idx_audit_timestamp;
      DROP INDEX IF EXISTS idx_sessions_user;
      DROP INDEX IF EXISTS idx_api_keys_user;
      DROP INDEX IF EXISTS idx_api_keys_hash;
      DROP INDEX IF EXISTS idx_users_email;
      DROP TABLE IF EXISTS audit_log;
      DROP TABLE IF EXISTS api_keys;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS role_permissions;
      DROP TABLE IF EXISTS permissions;
      DROP TABLE IF EXISTS roles;
      DROP TABLE IF EXISTS users;

      -- Recreate old audit_log if needed (matching migration 4 schema)
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        actor_id TEXT,
        actor_type TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        correlation_id TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      -- Recreate old api_keys
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT,
        last_used_at TEXT,
        is_active INTEGER DEFAULT 1,
        rate_limit_requests_per_minute INTEGER DEFAULT 60,
        rate_limit_requests_per_hour INTEGER DEFAULT 1000,
        metadata TEXT
      );
    `,
  },
  {
    version: 8,
    name: "add_pipeline_locks",
    up: `
      -- Pipeline distributed lock table (replaces KV-based lock for strong consistency)
      CREATE TABLE IF NOT EXISTS pipeline_locks (
          lock_name TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          trace_id TEXT NOT NULL,
          acquired_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS idx_pipeline_locks_expires ON pipeline_locks(expires_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_pipeline_locks_expires;
      DROP TABLE IF EXISTS pipeline_locks;
    `,
  },
];
