import type { Migration } from "./types";

/**
 * Migrations 3-4: full-text search + analytics/audit/research-cache tables.
 * Concatenated into the main MIGRATIONS array by schema.ts to preserve order.
 */
export const MIGRATIONS_PART_2: Migration[] = [
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
];
