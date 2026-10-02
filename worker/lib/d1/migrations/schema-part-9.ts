import type { Migration } from "./types";

/**
 * Migration 15: deal success-feedback table (ADR-033 slice 1).
 * UNIQUE(user_id, referral_code) with upsert semantics in the application
 * layer (worker/lib/d1/deal-feedback.ts uses ON CONFLICT DO UPDATE) so users
 * can revise their outcome report instead of being locked to a first
 * impression. Mirrors migrations/0009_deal_feedback.sql.
 */
export const MIGRATIONS_PART_9: Migration[] = [
  {
    version: 15,
    name: "add_deal_feedback",
    up: `
      CREATE TABLE IF NOT EXISTS deal_feedback (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          referral_code TEXT NOT NULL,
          outcome TEXT NOT NULL CHECK(outcome IN ('success', 'expired', 'invalid')),
          source_channel TEXT NOT NULL DEFAULT 'api',
          comment TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          UNIQUE(user_id, referral_code)
      );

      CREATE INDEX IF NOT EXISTS idx_deal_feedback_code
        ON deal_feedback(referral_code);

      CREATE INDEX IF NOT EXISTS idx_deal_feedback_user
        ON deal_feedback(user_id);
    `,
    down: `
      DROP TABLE IF EXISTS deal_feedback;
    `,
  },
];
