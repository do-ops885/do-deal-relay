import type { Migration } from "./types";

/**
 * Migrations 1-2: core schema (categories, deals, referral_codes) + indexes.
 * Concatenated into the main MIGRATIONS array by schema.ts to preserve order.
 */
export const MIGRATIONS_PART_1: Migration[] = [
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
];
