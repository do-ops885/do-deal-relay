import type { Migration } from "./types";

/**
 * Migration 12: NLQ saved queries per user + suggestions support.
 * Adds persistent store for user-saved natural language queries.
 */
export const MIGRATIONS_PART_6: Migration[] = [
  {
    version: 12,
    name: "add_nlq_saved_queries",
    up: `
      CREATE TABLE IF NOT EXISTS nlq_saved_queries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          query TEXT NOT NULL CHECK(length(query) > 0 AND length(query) <= 500),
          name TEXT,
          intent TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_nlq_saved_user_created
        ON nlq_saved_queries(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_nlq_saved_user_query
        ON nlq_saved_queries(user_id, query);

      CREATE TRIGGER IF NOT EXISTS nlq_saved_queries_updated_at
      AFTER UPDATE ON nlq_saved_queries
      BEGIN
          UPDATE nlq_saved_queries SET updated_at = strftime('%s', 'now')
          WHERE id = new.id;
      END;
    `,
    down: `
      DROP TRIGGER IF EXISTS nlq_saved_queries_updated_at;
      DROP INDEX IF EXISTS idx_nlq_saved_user_query;
      DROP INDEX IF EXISTS idx_nlq_saved_user_created;
      DROP TABLE IF EXISTS nlq_saved_queries;
    `,
  },
];
