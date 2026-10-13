/**
 * D1 Research Cache — Batch Operations
 *
 * Key-based cache for research results stored in D1. Mirrors the
 * key/payload pattern used by the validation cache but backed by
 * D1 for durability and cross-worker visibility.
 *
 * Schema (research_cache_kv):
 *   key        TEXT PRIMARY KEY
 *   payload    TEXT NOT NULL  -- JSON
 *   expires_at INTEGER        -- unix seconds; NULL means never expires
 *   created_at INTEGER DEFAULT (strftime('%s', 'now'))
 *   updated_at TEXT
 *
 * Reads filter out expired rows via an `expires_at` predicate; expired rows
 * are removed by purgeExpiredResearchCache.
 *
 * Created by runtime migration 11 (migrations/0006_research_cache_kv.sql).
 * The legacy query/domain-shaped research_cache table is unrelated to this
 * module and remains untouched.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { CONFIG } from "../../config";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of keys per single batch operation */
const MAX_BATCH_SIZE = 100;

/** Milliseconds per second for unix-time conversion. */
const MS_PER_SECOND = 1000;

/**
 * Compute the `expires_at` value (unix seconds) for a cache write.
 *
 * @param ttlSeconds - Time-to-live in seconds.
 * @returns Unix timestamp (seconds) at which the entry expires.
 */
function computeExpiresAt(ttlSeconds: number): number {
  return Math.floor(Date.now() / MS_PER_SECOND) + ttlSeconds;
}

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
       FROM research_cache_kv
       WHERE key IN (${placeholders})
         AND (expires_at IS NULL OR expires_at > strftime('%s', 'now'))`,
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
 * @param ttlSeconds - Time-to-live in seconds (defaults to
 *   CONFIG.RESEARCH_CACHE_TTL_SECONDS)
 */
export async function putResearchCacheBatch(
  db: D1Database,
  keys: string[],
  payloads: unknown[],
  ttlSeconds: number = CONFIG.RESEARCH_CACHE_TTL_SECONDS,
): Promise<void> {
  if (keys.length === 0) return;
  if (keys.length !== payloads.length) {
    throw new Error(
      `putResearchCacheBatch: keys (${keys.length}) and payloads (${payloads.length}) length mismatch`,
    );
  }

  const count = Math.min(keys.length, MAX_BATCH_SIZE);
  const now = new Date().toISOString();
  const expiresAt = computeExpiresAt(ttlSeconds);

  const statements = Array.from({ length: count }, (_, i) => {
    const key = keys[i];
    if (key === undefined) return null;
    const payload = JSON.stringify(payloads[i]);

    return db
      .prepare(
        `INSERT INTO research_cache_kv (key, payload, created_at, updated_at, expires_at)
         VALUES (?1, ?2, ?3, ?3, ?4)
         ON CONFLICT(key) DO UPDATE SET
           payload    = excluded.payload,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`,
      )
      .bind(key, payload, now, expiresAt);
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
       FROM research_cache_kv
       WHERE key = ?1
         AND (expires_at IS NULL OR expires_at > strftime('%s', 'now'))`,
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
 * @param ttlSeconds - Time-to-live in seconds (defaults to
 *   CONFIG.RESEARCH_CACHE_TTL_SECONDS)
 */
export async function putResearchCache(
  db: D1Database,
  key: string,
  payload: unknown,
  ttlSeconds: number = CONFIG.RESEARCH_CACHE_TTL_SECONDS,
): Promise<void> {
  const now = new Date().toISOString();
  const jsonPayload = JSON.stringify(payload);
  const expiresAt = computeExpiresAt(ttlSeconds);

  await db
    .prepare(
      `INSERT INTO research_cache_kv (key, payload, created_at, updated_at, expires_at)
       VALUES (?1, ?2, ?3, ?3, ?4)
       ON CONFLICT(key) DO UPDATE SET
         payload    = excluded.payload,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
    )
    .bind(key, jsonPayload, now, expiresAt)
    .run();
}

// ============================================================================
// Expiry Purge
// ============================================================================

/**
 * Delete expired research cache entries.
 *
 * Complements the read-time `expires_at` filter: filtering hides stale rows
 * from readers, while this sweep reclaims their storage.
 *
 * @param db - D1 database instance
 * @returns Number of rows deleted.
 */
export async function purgeExpiredResearchCache(
  db: D1Database,
): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM research_cache_kv
       WHERE expires_at IS NOT NULL
         AND expires_at <= strftime('%s', 'now')`,
    )
    .run();

  return result.meta?.changes ?? 0;
}
