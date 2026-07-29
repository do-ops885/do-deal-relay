/**
 * D1 Research Cache — Batch Operations
 *
 * Key-based cache for research results stored in D1. Mirrors the
 * key/payload pattern used by the validation cache but backed by
 * D1 for durability and cross-worker visibility.
 *
 * Schema (research_cache):
 *   key        TEXT PRIMARY KEY
 *   payload    TEXT NOT NULL  -- JSON
 *   created_at TEXT DEFAULT CURRENT_TIMESTAMP
 *   updated_at TEXT
 *
 * If the table still uses the legacy query/domain/results columns,
 * run the migration that adds key/payload before using this module.
 */

import type { D1Database } from "@cloudflare/workers-types";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of keys per single batch operation */
const MAX_BATCH_SIZE = 100;

// ============================================================================
// Batch Read
// ============================================================================

/**
 * Batch-fetch cached research payloads by key.
 *
 * Issues a single `SELECT … WHERE key IN (…)` query so D1 evaluates
 * one round-trip regardless of key count (up to MAX_BATCH_SIZE).
 *
 * @param db   - D1 database instance
 * @param keys - Cache keys to look up
 * @returns Map of key → parsed payload (missing keys are absent from the map)
 */
export async function getResearchCacheBatch(
  db: D1Database,
  keys: string[],
): Promise<Map<string, unknown>> {
  if (keys.length === 0) return new Map();

  const safeKeys = keys.slice(0, MAX_BATCH_SIZE);

  // Build positional placeholders: ?1, ?2, …
  const placeholders = safeKeys.map((_, i) => `?${i + 1}`).join(", ");

  const { results } = await db
    .prepare(
      `SELECT key, payload
       FROM research_cache
       WHERE key IN (${placeholders})`,
    )
    .bind(...safeKeys)
    .all<{ key: string; payload: string }>();

  const map = new Map<string, unknown>();
  for (const row of results ?? []) {
    if (!row) continue;
    try {
      map.set(row.key, JSON.parse(row.payload));
    } catch {
      // Malformed JSON — skip rather than crash the batch
    }
  }
  return map;
}

// ============================================================================
// Batch Write
// ============================================================================

/**
 * Batch insert-or-replace research payloads.
 *
 * Uses `INSERT … ON CONFLICT(key) DO UPDATE` so existing entries are
 * silently overwritten. All writes execute inside a single D1 batch
 * for atomicity.
 *
 * @param db       - D1 database instance
 * @param keys     - Cache keys (must be same length as payloads)
 * @param payloads - payloads to cache (must be same length as keys)
 */
export async function putResearchCacheBatch(
  db: D1Database,
  keys: string[],
  payloads: unknown[],
): Promise<void> {
  if (keys.length === 0) return;
  if (keys.length !== payloads.length) {
    throw new Error(
      `putResearchCacheBatch: keys (${keys.length}) and payloads (${payloads.length}) length mismatch`,
    );
  }

  const count = Math.min(keys.length, MAX_BATCH_SIZE);
  const now = new Date().toISOString();

  const statements = Array.from({ length: count }, (_, i) => {
    const key = keys[i];
    if (key === undefined) return null;
    const payload = JSON.stringify(payloads[i]);

    return db
      .prepare(
        `INSERT INTO research_cache (key, payload, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(key) DO UPDATE SET
           payload    = excluded.payload,
           updated_at = excluded.updated_at`,
      )
      .bind(key, payload, now);
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  await db.batch(statements);
}

// ============================================================================
// Single-Key Read
// ============================================================================

/**
 * Fetch a single cached research payload by key.
 *
 * @param db  - D1 database instance
 * @param key - Cache key
 * @returns Parsed payload or null when the key is absent / expired
 */
export async function getResearchCache(
  db: D1Database,
  key: string,
): Promise<unknown | null> {
  const row = await db
    .prepare(
      `SELECT payload
       FROM research_cache
       WHERE key = ?1`,
    )
    .bind(key)
    .first<{ payload: string }>();

  if (!row) return null;

  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

// ============================================================================
// Single-Key Write
// ============================================================================

/**
 * Insert or replace a single research cache entry.
 *
 * @param db      - D1 database instance
 * @param key     - Cache key
 * @param payload - Object/array to cache (will be JSON-stringified)
 */
export async function putResearchCache(
  db: D1Database,
  key: string,
  payload: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  const jsonPayload = JSON.stringify(payload);

  await db
    .prepare(
      `INSERT INTO research_cache (key, payload, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(key) DO UPDATE SET
         payload    = excluded.payload,
         updated_at = excluded.updated_at`,
    )
    .bind(key, jsonPayload, now)
    .run();
}
