-- ============================================================================
-- Migration 0006: Research Cache KV (keyed-JSON design)
-- ============================================================================
-- Backing table for worker/lib/d1/research-cache.ts helpers, which read and
-- write keyed JSON payloads. Separate from the legacy research_cache table
-- (query/domain/results shape), which stays untouched for its own readers.
-- updated_at has no default because every helper write supplies it.
CREATE TABLE IF NOT EXISTS research_cache_kv (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at TEXT
);
