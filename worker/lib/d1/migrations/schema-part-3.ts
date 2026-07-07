import type { Migration } from "./types";

/**
 * Migrations 5-6: derived views + experience/feedback tables.
 * Concatenated into the main MIGRATIONS array by schema.ts to preserve order.
 */
export const MIGRATIONS_PART_3: Migration[] = [
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
];
