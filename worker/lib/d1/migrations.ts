/**
 * D1 Database Migration System
 * Schema version tracking with up/down migration support
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1Client, QueryResult } from "./client";

// ============================================================================
// Migration Types
// ============================================================================

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

export interface MigrationRecord {
  version: number;
  name: string;
  applied_at: number;
}

export interface MigrationResult {
  success: boolean;
  applied: number[];
  rolledBack: number[];
  currentVersion: number;
  error?: string;
}

export interface MigrationStatus {
  currentVersion: number;
  pending: number[];
  applied: number[];
  latestVersion: number;
}

// ============================================================================
// Migration Registry
// ============================================================================

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    up: `
      -- Categories table
      CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          icon TEXT,
          parent_id INTEGER,
          sort_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
      );

      -- Deals table
      CREATE TABLE IF NOT EXISTS deals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deal_id TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          code TEXT,
          url TEXT NOT NULL,
          domain TEXT NOT NULL,
          source_url TEXT,
          source_trust_score REAL DEFAULT 0.5,
          reward_type TEXT,
          reward_value REAL,
          reward_currency TEXT DEFAULT 'USD',
          reward_description TEXT,
          category TEXT,
          tags TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          is_active INTEGER DEFAULT 1,
          expiry_date TEXT,
          expiry_confidence REAL DEFAULT 0.5,
          expiry_type TEXT DEFAULT 'unknown',
          requirements TEXT,
          normalized_at TEXT,
          confidence_score REAL DEFAULT 0.5,
          raw_data TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      -- Referral codes table
      CREATE TABLE IF NOT EXISTS referral_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL COLLATE NOCASE,
          deal_id INTEGER NOT NULL,
          user_id TEXT,
          submitted_by TEXT,
          max_uses INTEGER,
          current_uses INTEGER DEFAULT 0,
          use_count INTEGER DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          is_active INTEGER DEFAULT 1,
          expires_at TEXT,
          title TEXT,
          description TEXT,
          reward_type TEXT,
          reward_value TEXT,
          metadata TEXT,
          submitted_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          deactivated_at TEXT,
          deactivated_reason TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
      );

      -- Schema migrations table
      CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      -- Default categories
      INSERT OR IGNORE INTO categories (name, description, sort_order) VALUES
          ('hosting', 'Web Hosting & Cloud Services', 1),
          ('domains', 'Domain Registration', 2),
          ('cdn', 'CDN & Edge Services', 3),
          ('security', 'Security & SSL', 4),
          ('developer', 'Developer Tools', 5),
          ('analytics', 'Analytics & Monitoring', 6),
          ('marketing', 'Marketing & SEO', 7),
          ('productivity', 'Productivity & SaaS', 8);
    `,
    down: `
      DROP TABLE IF EXISTS referral_codes;
      DROP TABLE IF EXISTS deals;
      DROP TABLE IF EXISTS categories;
      DROP TABLE IF EXISTS schema_migrations;
    `,
  },
  {
    version: 2,
    name: "add_indexes",
    up: `
      -- Deals indexes
      CREATE INDEX IF NOT EXISTS idx_deals_code ON deals(code) WHERE code IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_deals_domain ON deals(domain);
      CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
      CREATE INDEX IF NOT EXISTS idx_deals_category ON deals(category);
      CREATE INDEX IF NOT EXISTS idx_deals_expiry ON deals(expiry_date) WHERE expiry_date IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_deals_active ON deals(id) WHERE is_active = 1;
      CREATE INDEX IF NOT EXISTS idx_deals_created ON deals(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_deals_confidence ON deals(confidence_score DESC) WHERE is_active = 1;

      -- Referral codes indexes
      CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
      CREATE INDEX IF NOT EXISTS idx_referral_codes_deal_id ON referral_codes(deal_id);
      CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id) WHERE user_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_referral_codes_status ON referral_codes(status);
      CREATE INDEX IF NOT EXISTS idx_referral_codes_expires ON referral_codes(expires_at) WHERE expires_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_referral_codes_active ON referral_codes(id) WHERE is_active = 1;
    `,
    down: `
      DROP INDEX IF EXISTS idx_deals_code;
      DROP INDEX IF EXISTS idx_deals_domain;
      DROP INDEX IF EXISTS idx_deals_status;
      DROP INDEX IF EXISTS idx_deals_category;
      DROP INDEX IF EXISTS idx_deals_expiry;
      DROP INDEX IF EXISTS idx_deals_active;
      DROP INDEX IF EXISTS idx_deals_created;
      DROP INDEX IF EXISTS idx_deals_confidence;
      DROP INDEX IF EXISTS idx_referral_codes_code;
      DROP INDEX IF EXISTS idx_referral_codes_deal_id;
      DROP INDEX IF EXISTS idx_referral_codes_user_id;
      DROP INDEX IF EXISTS idx_referral_codes_status;
      DROP INDEX IF EXISTS idx_referral_codes_expires;
      DROP INDEX IF EXISTS idx_referral_codes_active;
    `,
  },
  {
    version: 3,
    name: "add_fts",
    up: `
      -- Create FTS5 virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_deals USING fts5(
          title,
          description,
          domain,
          deal_id UNINDEXED,
          tokenize='porter'
      );

      -- Populate FTS from existing deals
      INSERT INTO fts_deals (title, description, domain, deal_id)
      SELECT title, description, domain, deal_id FROM deals;

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS deals_fts_insert 
      AFTER INSERT ON deals 
      BEGIN
          INSERT INTO fts_deals (title, description, domain, deal_id)
          VALUES (new.title, new.description, new.domain, new.deal_id);
      END;

      CREATE TRIGGER IF NOT EXISTS deals_fts_update 
      AFTER UPDATE ON deals 
      BEGIN
          UPDATE fts_deals SET 
              title = new.title,
              description = new.description,
              domain = new.domain
          WHERE deal_id = old.deal_id;
      END;

      CREATE TRIGGER IF NOT EXISTS deals_fts_delete 
      AFTER DELETE ON deals 
      BEGIN
          DELETE FROM fts_deals WHERE deal_id = old.deal_id;
      END;

      -- Updated at triggers
      CREATE TRIGGER IF NOT EXISTS deals_updated_at 
      AFTER UPDATE ON deals 
      BEGIN
          UPDATE deals SET updated_at = strftime('%s', 'now')
          WHERE id = new.id;
      END;

      CREATE TRIGGER IF NOT EXISTS referral_codes_updated_at 
      AFTER UPDATE ON referral_codes 
      BEGIN
          UPDATE referral_codes SET updated_at = strftime('%s', 'now')
          WHERE id = new.id;
      END;
    `,
    down: `
      DROP TRIGGER IF EXISTS deals_fts_insert;
      DROP TRIGGER IF EXISTS deals_fts_update;
      DROP TRIGGER IF EXISTS deals_fts_delete;
      DROP TRIGGER IF EXISTS deals_updated_at;
      DROP TRIGGER IF EXISTS referral_codes_updated_at;
      DROP TABLE IF EXISTS fts_deals;
    `,
  },
  {
    version: 4,
    name: "add_analytics_tables",
    up: `
      -- Referral usage tracking
      CREATE TABLE IF NOT EXISTS referral_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          referral_code_id INTEGER NOT NULL,
          used_by TEXT,
          used_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          ip_hash TEXT,
          user_agent_hash TEXT,
          referrer TEXT,
          metadata TEXT,
          FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id) ON DELETE CASCADE
      );

      -- Deal analytics
      CREATE TABLE IF NOT EXISTS deal_analytics (
          deal_id INTEGER PRIMARY KEY,
          total_referrals INTEGER DEFAULT 0,
          total_uses INTEGER DEFAULT 0,
          unique_users INTEGER DEFAULT 0,
          last_24h_uses INTEGER DEFAULT 0,
          last_7d_uses INTEGER DEFAULT 0,
          last_30d_uses INTEGER DEFAULT 0,
          click_through_rate REAL DEFAULT 0,
          conversion_rate REAL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
      );

      -- Audit log
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

      -- Research cache
      CREATE TABLE IF NOT EXISTS research_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          domain TEXT,
          results TEXT NOT NULL,
          expires_at TEXT,
          hit_count INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          UNIQUE(query, domain)
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_referral_usage_code_id ON referral_usage(referral_code_id);
      CREATE INDEX IF NOT EXISTS idx_referral_usage_used_at ON referral_usage(used_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_research_cache_query ON research_cache(query, domain);
    `,
    down: `
      DROP TABLE IF EXISTS referral_usage;
      DROP TABLE IF EXISTS deal_analytics;
      DROP TABLE IF EXISTS audit_log;
      DROP TABLE IF EXISTS research_cache;
    `,
  },
  {
    version: 5,
    name: "add_views",
    up: `
      -- Active deals view
      CREATE VIEW IF NOT EXISTS v_active_deals AS
      SELECT * FROM deals 
      WHERE is_active = 1 
      AND status = 'active'
      AND (expiry_date IS NULL OR expiry_date > datetime('now'));

      -- Expiring deals view
      CREATE VIEW IF NOT EXISTS v_expiring_deals AS
      SELECT 
          d.*,
          julianday(d.expiry_date) - julianday('now') as days_remaining
      FROM deals d
      WHERE d.expiry_date IS NOT NULL
      AND d.expiry_date > datetime('now')
      AND d.is_active = 1;

      -- Referral stats view
      CREATE VIEW IF NOT EXISTS v_referral_stats AS
      SELECT 
          rc.id,
          rc.code,
          rc.deal_id,
          d.title as deal_title,
          rc.max_uses,
          rc.current_uses,
          rc.use_count,
          CASE 
              WHEN rc.max_uses IS NOT NULL THEN 
                  ROUND((rc.current_uses * 100.0) / rc.max_uses, 2)
              ELSE NULL 
          END as usage_percentage,
          rc.expires_at,
          CASE 
              WHEN rc.expires_at IS NOT NULL THEN 
                  julianday(rc.expires_at) - julianday('now')
              ELSE NULL 
          END as days_remaining
      FROM referral_codes rc
      JOIN deals d ON rc.deal_id = d.id;
    `,
    down: `
      DROP VIEW IF EXISTS v_active_deals;
      DROP VIEW IF EXISTS v_expiring_deals;
      DROP VIEW IF EXISTS v_referral_stats;
    `,
  },
  {
    version: 6,
    name: "add_experience_feedback_tables",
    up: `
      CREATE TABLE IF NOT EXISTS experience_events (
          id TEXT PRIMARY KEY,
          deal_code TEXT NOT NULL,
          event_type TEXT NOT NULL,
          agent_id TEXT,
          score INTEGER,
          metadata TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS experience_aggregates (
          deal_code TEXT PRIMARY KEY,
          total_events INTEGER DEFAULT 0,
          positive_events INTEGER DEFAULT 0,
          negative_events INTEGER DEFAULT 0,
          avg_score REAL DEFAULT 0,
          last_updated INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_experience_events_deal_code ON experience_events(deal_code);
      CREATE INDEX IF NOT EXISTS idx_experience_events_type ON experience_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_experience_events_created ON experience_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_experience_events_agent ON experience_events(agent_id) WHERE agent_id IS NOT NULL;
    `,
    down: `
      DROP INDEX IF EXISTS idx_experience_events_deal_code;
      DROP INDEX IF EXISTS idx_experience_events_type;
      DROP INDEX IF EXISTS idx_experience_events_created;
      DROP INDEX IF EXISTS idx_experience_events_agent;
      DROP TABLE IF EXISTS experience_aggregates;
      DROP TABLE IF EXISTS experience_events;
    `,
  },
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
      SELECT CAST(id AS TEXT), actor_id, action, resource_type, resource_id, details, ip_address, correlation_id, timestamp
      FROM audit_log_old;

      DROP TABLE IF EXISTS audit_log_old;

      -- Populate users from old api_keys to maintain foreign key integrity
      INSERT OR IGNORE INTO users (id, email, name, password_hash, role, is_active)
      SELECT DISTINCT user_id, user_id || '@placeholder.com', 'Legacy User ' || user_id, 'LEGACY_MIGRATED', role, 1
      FROM api_keys;

      -- Finalize api_keys
      INSERT INTO api_keys_new (id, user_id, key_hash, name, permissions, last_used_at, expires_at, created_at)
      SELECT CAST(id AS TEXT), user_id, key_hash, 'Migrated Key', '[]', last_used_at, expires_at, created_at
      FROM api_keys;

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

      -- Recreate old audit_log if needed (simplified)
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        action TEXT NOT NULL,
        actor_id TEXT,
        actor_type TEXT,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        correlation_id TEXT
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
];

// ============================================================================
// Migration Runner
// ============================================================================

export class MigrationRunner {
  private db: D1Database;
  private client: ReturnType<typeof createD1Client>;

  constructor(db: D1Database) {
    this.db = db;
    this.client = createD1Client(db);
  }

  /**
   * Get current migration status
   */
  async getStatus(): Promise<MigrationStatus> {
    // Ensure migrations table exists
    await this.ensureMigrationsTable();

    const appliedResult = await this.client.query<MigrationRecord>(
      "SELECT version, name, applied_at FROM schema_migrations ORDER BY version",
    );

    const applied =
      appliedResult.success && appliedResult.data
        ? appliedResult.data.map((r) => r.version)
        : [];

    const allVersions = MIGRATIONS.map((m) => m.version);
    const pending = allVersions.filter((v) => !applied.includes(v));

    const currentVersion = applied.length > 0 ? Math.max(...applied) : 0;

    return {
      currentVersion,
      pending,
      applied,
      latestVersion: Math.max(...allVersions),
    };
  }

  /**
   * Apply pending migrations
   */
  async migrate(targetVersion?: number): Promise<MigrationResult> {
    const status = await this.getStatus();
    const appliedVersions: number[] = [];

    // Filter migrations to apply
    let migrationsToApply = MIGRATIONS.filter(
      (m) => m.version > status.currentVersion,
    );

    if (targetVersion !== undefined) {
      migrationsToApply = migrationsToApply.filter(
        (m) => m.version <= targetVersion,
      );
    }

    for (const migration of migrationsToApply) {
      try {
        // Execute migration
        const result = await this.client.raw(migration.up);

        if (!result.success) {
          return {
            success: false,
            applied: appliedVersions,
            rolledBack: [],
            currentVersion: status.currentVersion,
            error: `Migration ${migration.version} (${migration.name}) failed: ${result.error}`,
          };
        }

        // Record migration
        await this.client.execute(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, strftime('%s', 'now'))",
          [migration.version, migration.name],
        );

        appliedVersions.push(migration.version);
      } catch (error) {
        return {
          success: false,
          applied: appliedVersions,
          rolledBack: [],
          currentVersion: status.currentVersion,
          error: `Migration ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return {
      success: true,
      applied: appliedVersions,
      rolledBack: [],
      currentVersion:
        appliedVersions.length > 0
          ? Math.max(...appliedVersions)
          : status.currentVersion,
    };
  }

  /**
   * Rollback migrations
   */
  async rollback(steps: number = 1): Promise<MigrationResult> {
    const status = await this.getStatus();
    const rolledBackVersions: number[] = [];

    const migrationsToRollback = MIGRATIONS.filter((m) =>
      status.applied.includes(m.version),
    )
      .sort((a, b) => b.version - a.version)
      .slice(0, steps);

    for (const migration of migrationsToRollback) {
      try {
        // Execute rollback
        const result = await this.client.raw(migration.down);

        if (!result.success) {
          return {
            success: false,
            applied: [],
            rolledBack: rolledBackVersions,
            currentVersion: status.currentVersion,
            error: `Rollback ${migration.version} failed: ${result.error}`,
          };
        }

        // Remove migration record
        await this.client.execute(
          "DELETE FROM schema_migrations WHERE version = ?",
          [migration.version],
        );

        rolledBackVersions.push(migration.version);
      } catch (error) {
        return {
          success: false,
          applied: [],
          rolledBack: rolledBackVersions,
          currentVersion: status.currentVersion,
          error: `Rollback ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return {
      success: true,
      applied: [],
      rolledBack: rolledBackVersions,
      currentVersion:
        rolledBackVersions.length > 0
          ? Math.max(
              ...status.applied.filter((v) => !rolledBackVersions.includes(v)),
            )
          : status.currentVersion,
    };
  }

  /**
   * Reset database (rollback all migrations)
   */
  async reset(): Promise<MigrationResult> {
    const status = await this.getStatus();

    if (status.applied.length === 0) {
      return {
        success: true,
        applied: [],
        rolledBack: [],
        currentVersion: 0,
      };
    }

    return this.rollback(status.applied.length);
  }

  /**
   * Fresh migrate (reset + migrate)
   */
  async fresh(): Promise<MigrationResult> {
    const resetResult = await this.reset();
    if (!resetResult.success) {
      return resetResult;
    }

    return this.migrate();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async ensureMigrationsTable(): Promise<void> {
    await this.client.raw(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createMigrationRunner(db: D1Database): MigrationRunner {
  return new MigrationRunner(db);
}

/**
 * Initialize database with all migrations
 */
export async function initDatabase(db: D1Database): Promise<MigrationResult> {
  const runner = createMigrationRunner(db);
  return runner.migrate();
}

/**
 * Get database status
 */
export async function getMigrationStatus(
  db: D1Database,
): Promise<MigrationStatus> {
  const runner = createMigrationRunner(db);
  return runner.getStatus();
}
