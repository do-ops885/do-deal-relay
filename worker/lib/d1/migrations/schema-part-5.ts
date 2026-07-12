import type { Migration } from "./types";

/**
 * Migration 9: trust_scores table for atomic source trust evolution.
 * Replaces KV-based source registry trust scores with D1 for strong consistency.
 * See: plans/ADR-017-durable-objects-migration.md
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
];
