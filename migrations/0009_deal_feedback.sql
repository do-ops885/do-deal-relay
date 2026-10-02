-- Migration 0009: Deal success feedback
-- Mirrors runtime migration v15 (add_deal_feedback) in
-- worker/lib/d1/migrations/schema-part-9.ts. Dual-write pattern:
-- every runtime version has a raw SQL mirror here.
--
-- Dialect: SQLite (Cloudflare D1). The migrations tree is excluded from
-- Codacy static analysis (see .codacy.yml); Codacy's SQL linter parses a
-- Postgres dialect and cannot reliably validate SQLite DDL.
--
-- Upsert semantics live in the application layer
-- (worker/lib/d1/deal-feedback.ts ON CONFLICT DO UPDATE) so a user can
-- revise their outcome report instead of being locked to a first impression.

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
