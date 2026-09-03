// ============================================================================
// SourceRegistry Durable Object — Atomic Trust Score Management
// ============================================================================
// Manages source trust scores via DO + SQLite for strong consistency.
// Each source is tracked with cumulative deal outcomes, enabling
// atomic trust evolution without cross-worker race conditions.
//
// See: plans/ADR-017-durable-objects-migration.md (Phase 3)
// ============================================================================

import type { DurableObjectState } from "@cloudflare/workers-types";

// ============================================================================
// Types
// ============================================================================

/** Trust score data for a source, returned by RPC methods. */
export interface TrustScore {
  source_id: string;
  trust_score: number;
  total_deals: number;
  successful_deals: number;
  classification: "trusted" | "probationary" | "unverified";
  last_seen_at: number | null;
  created_at: number;
}

/** Result returned by the atomic rate-limit RPC method. */
export interface AtomicRateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** Row shape stored in the sources table. */
interface SourceRow extends Record<string, string | number | null> {
  source_id: string;
  trust_score: number;
  total_deals: number;
  successful_deals: number;
  classification: string;
  last_seen_at: number | null;
  created_at: number;
}

// ============================================================================
// Trust Adjustment Constants
// ============================================================================

/** Trust increase per successful deal. */
const TRUST_SUCCESS_DELTA = 0.05;

/** Trust decrease per failed deal. */
const TRUST_FAILURE_DELTA = -0.02;

/** Minimum trust score (floor). */
const TRUST_MIN = 0.0;

/** Maximum trust score (ceiling). */
const TRUST_MAX = 1.0;

/** Classification thresholds. */
const TRUST_THRESHOLD_TRUSTED = 0.7;
const TRUST_THRESHOLD_PROBATIONARY = 0.4;

// ============================================================================
// SourceRegistry Durable Object
// ============================================================================

/**
 * Globally-unique, single-threaded Durable Object providing atomic
 * source trust management via SQLite storage.
 *
 * Usage (RPC from Worker):
 *   const stub = env.SOURCE_REGISTRY.getByName("sources");
 *   const newScore = await stub.evolveTrust("src-abc", true);
 *   const score = await stub.getTrustScore("src-abc");
 *   const top = await stub.getTopTrusted(10);
 */
export class SourceRegistry {
  private readonly sql: DurableObjectState["storage"]["sql"];

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql;

    // Create the sources table if it doesn't exist.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS sources (
        source_id       TEXT PRIMARY KEY,
        trust_score     REAL    DEFAULT 0.5,
        total_deals     INTEGER DEFAULT 0,
        successful_deals INTEGER DEFAULT 0,
        classification  TEXT    DEFAULT 'unverified',
        last_seen_at    INTEGER,
        created_at      INTEGER
      )`,
    );

    // This table is intentionally independent from trust data so rate-limit
    // actors can safely share this deployed class without affecting sources.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS rate_limits (
        rate_limit_key TEXT PRIMARY KEY,
        count          INTEGER NOT NULL,
        window_start   INTEGER NOT NULL
      )`,
    );
  }

  /**
   * Atomically consumes one request from a fixed-window rate limit.
   *
   * Rate-limit callers shard to one SourceRegistry instance per key, so this
   * synchronous SQLite read/write sequence runs without cross-request races.
   */
  async consumeRateLimit(
    rateLimitKey: string,
    maxRequests: number,
    windowStart: number,
  ): Promise<AtomicRateLimitResult> {
    if (
      !rateLimitKey ||
      !Number.isSafeInteger(maxRequests) ||
      maxRequests < 1
    ) {
      throw new Error("Invalid rate limit request");
    }

    const rows = this.sql
      .exec<{ count: number; window_start: number }>(
        "SELECT count, window_start FROM rate_limits WHERE rate_limit_key = ?",
        rateLimitKey,
      )
      .toArray();
    const stored = rows[0];
    const count = stored?.window_start === windowStart ? stored.count : 0;

    if (count >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    const nextCount = count + 1;
    this.sql.exec(
      `INSERT INTO rate_limits (rate_limit_key, count, window_start)
       VALUES (?, ?, ?)
       ON CONFLICT(rate_limit_key) DO UPDATE SET count = excluded.count`,
      rateLimitKey,
      nextCount,
      windowStart,
    );

    return { allowed: true, remaining: maxRequests - nextCount };
  }

  // --------------------------------------------------------------------------
  // evolveTrust
  // --------------------------------------------------------------------------

  /**
   * Atomically evolve a source's trust score based on deal outcome.
   *
   * INSERTs the source on first encounter, then applies the trust delta
   * in a single SQL expression to avoid read-modify-write races.
   *
   * @param source_id - Unique source identifier.
   * @param success   - Whether the deal succeeded.
   * @returns         - The updated trust score.
   */
  async evolveTrust(source_id: string, success: boolean): Promise<number> {
    const now = Date.now();
    const delta = success ? TRUST_SUCCESS_DELTA : TRUST_FAILURE_DELTA;

    // Upsert: insert with default 0.5 if new, then atomically adjust.
    // The COALESCE ensures we read the existing score for updates.
    this.sql.exec(
      `INSERT INTO sources (source_id, trust_score, total_deals, successful_deals, classification, last_seen_at, created_at)
       VALUES (?, 0.5, 0, 0, 'unverified', ?, ?)
       ON CONFLICT(source_id) DO NOTHING`,
      source_id,
      now,
      now,
    );

    // Atomic trust evolution: clamp to [0, 1] and update classification.
    this.sql.exec(
      `UPDATE sources
       SET trust_score = MAX(?, MIN(?, COALESCE(trust_score, 0.5) + ?)),
           total_deals = COALESCE(total_deals, 0) + 1,
           successful_deals = COALESCE(successful_deals, 0) + ?,
           last_seen_at = ?,
           classification = CASE
             WHEN MAX(?, MIN(?, COALESCE(trust_score, 0.5) + ?)) >= ? THEN 'trusted'
             WHEN MAX(?, MIN(?, COALESCE(trust_score, 0.5) + ?)) >= ? THEN 'probationary'
             ELSE 'unverified'
           END
       WHERE source_id = ?`,
      TRUST_MIN,
      TRUST_MAX,
      delta,
      success ? 1 : 0,
      now,
      TRUST_MIN,
      TRUST_MAX,
      delta,
      TRUST_THRESHOLD_TRUSTED,
      TRUST_MIN,
      TRUST_MAX,
      delta,
      TRUST_THRESHOLD_PROBATIONARY,
      source_id,
    );

    // Read back the updated score.
    const row = this.sql
      .exec<SourceRow>(
        `SELECT source_id, trust_score, total_deals, successful_deals,
                classification, last_seen_at, created_at
         FROM sources WHERE source_id = ?`,
        source_id,
      )
      .one();

    return Number(row.trust_score);
  }

  // --------------------------------------------------------------------------
  // getTrustScore
  // --------------------------------------------------------------------------

  /**
   * Get the trust score for a single source.
   *
   * @param source_id - Unique source identifier.
   * @returns         - Trust score data, or null if source not found.
   */
  async getTrustScore(source_id: string): Promise<TrustScore | null> {
    const rows = this.sql
      .exec<SourceRow>(
        `SELECT source_id, trust_score, total_deals, successful_deals,
                classification, last_seen_at, created_at
         FROM sources WHERE source_id = ?`,
        source_id,
      )
      .toArray();

    const first = rows[0];
    if (!first) return null;

    return this.rowToTrustScore(first);
  }

  // --------------------------------------------------------------------------
  // getTrustScores
  // --------------------------------------------------------------------------

  /**
   * Batch get trust scores for multiple sources.
   *
   * @param source_ids - Array of source identifiers to look up.
   * @returns          - Map of source_id to TrustScore for found sources.
   */
  async getTrustScores(source_ids: string[]): Promise<Map<string, TrustScore>> {
    const result = new Map<string, TrustScore>();

    if (source_ids.length === 0) return result;

    // Build a parameterized IN clause: ?, ?, ? ...
    const placeholders = source_ids.map(() => "?").join(", ");
    const rows = this.sql
      .exec<SourceRow>(
        `SELECT source_id, trust_score, total_deals, successful_deals,
                classification, last_seen_at, created_at
         FROM sources WHERE source_id IN (${placeholders})`,
        ...source_ids,
      )
      .toArray();

    for (const row of rows) {
      result.set(row.source_id, this.rowToTrustScore(row));
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // getTopTrusted
  // --------------------------------------------------------------------------

  /**
   * Get the top N most trusted sources, ordered by trust score descending.
   *
   * @param limit - Maximum number of sources to return (default 10).
   * @returns     - Array of TrustScore entries, highest trust first.
   */
  async getTopTrusted(limit: number = 10): Promise<TrustScore[]> {
    const rows = this.sql
      .exec<SourceRow>(
        `SELECT source_id, trust_score, total_deals, successful_deals,
                classification, last_seen_at, created_at
         FROM sources
         ORDER BY trust_score DESC, successful_deals DESC
         LIMIT ?`,
        limit,
      )
      .toArray();

    return rows.map((row) => this.rowToTrustScore(row));
  }

  // --------------------------------------------------------------------------
  // getSourcesNeedingReview
  // --------------------------------------------------------------------------

  /**
   * Get sources that need manual review — either low trust score or
   * a high failure rate relative to total deals.
   *
   * Criteria:
   *   - classification = 'unverified' (trust < 0.4), OR
   *   - failure rate > 50% with at least 3 deals processed
   *
   * @returns - Array of TrustScore entries matching review criteria.
   */
  async getSourcesNeedingReview(): Promise<TrustScore[]> {
    const rows = this.sql
      .exec<SourceRow>(
        `SELECT source_id, trust_score, total_deals, successful_deals,
                classification, last_seen_at, created_at
         FROM sources
         WHERE classification = 'unverified'
            OR (total_deals >= 3
                AND CAST(successful_deals AS REAL) / total_deals < 0.5)
         ORDER BY trust_score ASC, total_deals DESC`,
      )
      .toArray();

    return rows.map((row) => this.rowToTrustScore(row));
  }

  // --------------------------------------------------------------------------
  // fetch (required for Durable Object class)
  // --------------------------------------------------------------------------

  /**
   * Durable Object fetch handler — required by the runtime.
   * All trust logic lives in the RPC methods above; this is a minimal
   * fallback for HTTP-style invocations.
   */
  async fetch(): Promise<Response> {
    return new Response("SourceRegistry DO — use RPC methods", { status: 200 });
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Convert a SQLite row into a typed TrustScore object.
   *
   * @param row - Raw row from the sources table.
   * @returns   - Typed TrustScore with proper classification.
   */
  private rowToTrustScore(row: SourceRow): TrustScore {
    const trust_score = Number(row.trust_score);
    return {
      source_id: String(row.source_id),
      trust_score,
      total_deals: Number(row.total_deals),
      successful_deals: Number(row.successful_deals),
      classification: this.classify(trust_score),
      last_seen_at: row.last_seen_at != null ? Number(row.last_seen_at) : null,
      created_at: Number(row.created_at),
    };
  }

  /**
   * Derive classification from a trust score.
   *
   * @param score - Trust score in [0, 1].
   * @returns     - Classification string.
   */
  private classify(score: number): "trusted" | "probationary" | "unverified" {
    if (score >= TRUST_THRESHOLD_TRUSTED) return "trusted";
    if (score >= TRUST_THRESHOLD_PROBATIONARY) return "probationary";
    return "unverified";
  }
}
