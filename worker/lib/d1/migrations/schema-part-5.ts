import type { Migration } from "./types";

/**
 * Migrations 9-10: source trust evolution and Reddit post lifecycle state.
 */
export const MIGRATIONS_PART_5: Migration[] = [
  {
    version: 9,
    name: "add_trust_scores",
    up: `
      -- Trust scores table (replaces KV-based source registry trust)
      -- Provides atomic trust evolution via D1 batch operations
      CREATE TABLE IF NOT EXISTS trust_scores (
          domain TEXT PRIMARY KEY,
          trust_score REAL NOT NULL DEFAULT 0.5,
          total_deals INTEGER NOT NULL DEFAULT 0,
          successful_deals INTEGER NOT NULL DEFAULT 0,
          classification TEXT NOT NULL DEFAULT 'unverified',
          last_seen_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Indexes for trust queries
      CREATE INDEX IF NOT EXISTS idx_trust_scores_score ON trust_scores(trust_score DESC);
      CREATE INDEX IF NOT EXISTS idx_trust_scores_classification ON trust_scores(classification);
      CREATE INDEX IF NOT EXISTS idx_trust_scores_last_seen ON trust_scores(last_seen_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_trust_scores_last_seen;
      DROP INDEX IF EXISTS idx_trust_scores_classification;
      DROP INDEX IF EXISTS idx_trust_scores_score;
      DROP TABLE IF EXISTS trust_scores;
    `,
  },
  {
    version: 10,
    name: "add_reddit_posts",
    up: `
      CREATE TABLE IF NOT EXISTS reddit_posts (
          id INTEGER PRIMARY KEY,
          fullname TEXT NOT NULL UNIQUE CHECK(substr(fullname, 1, 3) = 't3_'),
          deal_id TEXT NOT NULL,
          subreddit TEXT NOT NULL,
          posted_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'active'
            CHECK(status IN ('active', 'deleted')),
          delete_reason TEXT,
          deleted_at INTEGER,
          last_checked_at INTEGER,
          CHECK(
            (status = 'active' AND delete_reason IS NULL AND deleted_at IS NULL)
            OR
            (status = 'deleted' AND delete_reason IS NOT NULL AND deleted_at IS NOT NULL)
          )
      );

      CREATE INDEX IF NOT EXISTS idx_reddit_posts_status_checked
        ON reddit_posts(status, last_checked_at);
      CREATE INDEX IF NOT EXISTS idx_reddit_posts_deal_id
        ON reddit_posts(deal_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_reddit_posts_deal_id;
      DROP INDEX IF EXISTS idx_reddit_posts_status_checked;
      DROP TABLE IF EXISTS reddit_posts;
    `,
  },
];
