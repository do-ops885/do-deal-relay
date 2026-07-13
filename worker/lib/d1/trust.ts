/**
 * D1 Trust Score Mutations — Atomic Source Trust Evolution
 *
 * Replaces KV-based trust score updates (read-modify-write) with
 * D1 batch operations for strong consistency. Eliminates race
 * conditions when multiple pipeline runs evolve trust concurrently.
 *
 * See: plans/ADR-017-durable-objects-migration.md
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1Client } from "./client";

// ============================================================================
// Types
// ============================================================================

export interface TrustScoreRow {
  domain: string;
  trust_score: number;
  total_deals: number;
  successful_deals: number;
  classification: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrustEvolutionResult {
  domain: string;
  previous_score: number;
  new_score: number;
  adjustment: number;
  total_deals: number;
  successful_deals: number;
}

// ============================================================================
// Trust Constants
// ============================================================================

/** Trust adjustment for successful deal validation */
const TRUST_SUCCESS_ADJUSTMENT = 0.05;

/** Trust adjustment for failed deal validation */
const TRUST_FAILURE_ADJUSTMENT = -0.02;

/** Classification thresholds */
const CLASSIFICATION_THRESHOLDS = {
  trusted: 0.7,
  probationary: 0.4,
  unverified: 0.0,
} as const;

// ============================================================================
// Atomic Trust Evolution
// ============================================================================

/**
 * Atomically evolve trust score for a source domain.
 *
 * Uses D1 for atomicity: INSERT if new, UPDATE if exists.
 *
 * @param db - D1 database instance
 * @param domain - Source domain to update
 * @param success - Whether the deal validation succeeded
 * @returns Trust evolution result with previous/new scores
 */
export async function evolveTrust(
  db: D1Database,
  domain: string,
  success: boolean,
): Promise<TrustEvolutionResult> {
  const client = createD1Client(db);
  const adjustment = success
    ? TRUST_SUCCESS_ADJUSTMENT
    : TRUST_FAILURE_ADJUSTMENT;
  const now = new Date().toISOString();

  // Step 1: Get current score (for result)
  const currentResult = await client.query<TrustScoreRow>(
    `SELECT domain, trust_score, total_deals, successful_deals
     FROM trust_scores WHERE domain = ?`,
    [domain],
  );

  const rows = currentResult.data ?? [];
  const first = rows[0];
  const previousScore = first ? first.trust_score : 0.5;
  const currentTotal = first ? first.total_deals : 0;
  const currentSuccess = first ? first.successful_deals : 0;

  // Step 2: Calculate new values
  const newScore = Math.max(0, Math.min(1, previousScore + adjustment));
  const newTotal = currentTotal + 1;
  const newSuccess = currentSuccess + (success ? 1 : 0);
  const classification = classifyTrust(newScore);

  // Step 3: Atomic insert-or-update
  await client.execute(
    `INSERT INTO trust_scores (domain, trust_score, total_deals, successful_deals, classification, last_seen_at, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(domain) DO UPDATE SET
       trust_score = ?,
       total_deals = total_deals + 1,
       successful_deals = successful_deals + ?,
       classification = ?,
       last_seen_at = ?,
       updated_at = datetime('now')`,
    [
      domain,
      newScore,
      success ? 1 : 0,
      classification,
      now,
      newScore,
      success ? 1 : 0,
      classification,
      now,
    ],
  );

  return {
    domain,
    previous_score: previousScore,
    new_score: newScore,
    adjustment,
    total_deals: newTotal,
    successful_deals: newSuccess,
  };
}

/**
 * Batch evolve trust for multiple domains.
 *
 * Uses a single D1 batch for atomicity across all domains.
 *
 * @param db - D1 database instance
 * @param domains - Array of {domain, success} pairs
 * @returns Array of trust evolution results
 */
export async function evolveTrustBatch(
  db: D1Database,
  domains: Array<{ domain: string; success: boolean }>,
): Promise<TrustEvolutionResult[]> {
  const results: TrustEvolutionResult[] = [];
  const now = new Date().toISOString();

  // Build batch statements
  const statements = [];
  for (const { domain, success } of domains) {
    const adjustment = success
      ? TRUST_SUCCESS_ADJUSTMENT
      : TRUST_FAILURE_ADJUSTMENT;

    statements.push(
      db
        .prepare(
          `INSERT INTO trust_scores (domain, trust_score, total_deals, successful_deals, classification, last_seen_at, created_at, updated_at)
           VALUES (?, 0.5, 1, ?, 'unverified', ?, datetime('now'), datetime('now'))
           ON CONFLICT(domain) DO UPDATE SET
             trust_score = MAX(0, MIN(1, trust_score + ?)),
             total_deals = total_deals + 1,
             successful_deals = successful_deals + ?,
             classification = CASE
               WHEN MAX(0, MIN(1, trust_score + ?)) >= 0.7 THEN 'trusted'
               WHEN MAX(0, MIN(1, trust_score + ?)) >= 0.4 THEN 'probationary'
               ELSE 'unverified'
             END,
             last_seen_at = ?,
             updated_at = datetime('now')`,
        )
        .bind(
          domain,
          success ? 1 : 0,
          now,
          adjustment,
          success ? 1 : 0,
          adjustment,
          adjustment,
          now,
        ),
    );
  }

  // Execute batch
  await db.batch(statements);

  // Fetch updated scores for results
  for (const { domain, success } of domains) {
    const adjustment = success
      ? TRUST_SUCCESS_ADJUSTMENT
      : TRUST_FAILURE_ADJUSTMENT;
    const row = await db
      .prepare(
        `SELECT trust_score, total_deals, successful_deals
         FROM trust_scores WHERE domain = ?`,
      )
      .bind(domain)
      .first<TrustScoreRow>();

    results.push({
      domain,
      previous_score: row ? row.trust_score - adjustment : 0.5,
      new_score: row?.trust_score ?? 0.5,
      adjustment,
      total_deals: row?.total_deals ?? 1,
      successful_deals: row?.successful_deals ?? (success ? 1 : 0),
    });
  }

  return results;
}

// ============================================================================
// Trust Queries
// ============================================================================

/**
 * Get trust score for a domain
 */
export async function getTrustScore(
  db: D1Database,
  domain: string,
): Promise<TrustScoreRow | null> {
  const client = createD1Client(db);
  const result = await client.query<TrustScoreRow>(
    `SELECT * FROM trust_scores WHERE domain = ?`,
    [domain],
  );
  const rows = result.data ?? [];
  const first = rows[0];
  return first ?? null;
}

/**
 * Get trust scores for multiple domains
 */
export async function getTrustScores(
  db: D1Database,
  domains: string[],
): Promise<Map<string, TrustScoreRow>> {
  if (domains.length === 0) return new Map();

  const client = createD1Client(db);
  const placeholders = domains.map(() => "?").join(",");
  const result = await client.query<TrustScoreRow>(
    `SELECT * FROM trust_scores WHERE domain IN (${placeholders})`,
    domains,
  );

  const map = new Map<string, TrustScoreRow>();
  for (const row of result.data ?? []) {
    map.set(row.domain, row);
  }
  return map;
}

/**
 * Get top trusted domains
 */
export async function getTopTrustedDomains(
  db: D1Database,
  limit: number = 10,
): Promise<TrustScoreRow[]> {
  const client = createD1Client(db);
  const result = await client.query<TrustScoreRow>(
    `SELECT * FROM trust_scores
     WHERE classification = 'trusted'
     ORDER BY trust_score DESC, total_deals DESC
     LIMIT ?`,
    [limit],
  );
  return result.data ?? [];
}

/**
 * Get domains needing review (low trust or high failure rate)
 */
export async function getDomainsNeedingReview(
  db: D1Database,
  failureThreshold: number = 0.3,
): Promise<TrustScoreRow[]> {
  const client = createD1Client(db);
  const result = await client.query<TrustScoreRow>(
    `SELECT * FROM trust_scores
     WHERE trust_score < 0.3
        OR (total_deals > 5 AND successful_deals * 1.0 / total_deals < ?)
     ORDER BY trust_score ASC`,
    [failureThreshold],
  );
  return result.data ?? [];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Classify trust score into category
 */
function classifyTrust(score: number): string {
  if (score >= CLASSIFICATION_THRESHOLDS.trusted) return "trusted";
  if (score >= CLASSIFICATION_THRESHOLDS.probationary) return "probationary";
  return "unverified";
}
