/**
 * Dual-Write Referral Storage (KV + D1)
 *
 * During migration phase, writes to both KV and D1 databases.
 * Reads can be configured to use either storage backend.
 *
 * Feature flag: USE_D1_STORAGE - controls read source
 * Phase 1: Dual-write (write to both)
 * Phase 2: D1 primary (read from D1, keep KV as backup)
 * Phase 3: D1 only (remove KV writes)
 */

import type { Env, ReferralInput } from "../../types";
import {
  storeReferralInput as storeInKV,
  getReferralById as getFromKVById,
  getReferralByCode as getFromKVByCode,
  updateReferralStatus as updateInKV,
  deactivateReferral as deactivateInKV,
  reactivateReferral as reactivateInKV,
} from "./crud";
import {
  insertDeal,
  insertReferralCode,
  getReferralCodeByString,
  getReferralCodesByDeal,
} from "../d1/queries";
import { createD1Client } from "../d1/client";

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Check if D1 storage should be used for reads
 */
function useD1Reads(env: Env): boolean {
  // Check environment variable or default to false during migration
  return env.USE_D1_READS === "true" || false;
}

/**
 * Check if dual-write is enabled (write to both KV and D1)
 */
function useDualWrite(env: Env): boolean {
  // Always dual-write if D1 is available, unless explicitly disabled
  return !!env.DEALS_DB && env.DISABLE_DUAL_WRITE !== "true";
}

/**
 * Check if D1 writes are enabled
 */
function useD1Writes(env: Env): boolean {
  return !!env.DEALS_DB;
}

// ============================================================================
// Logging Helper
// ============================================================================

async function logDualWriteError(
  env: Env,
  operation: string,
  error: unknown,
): Promise<void> {
  console.error(`[DualWrite] ${operation} failed:`, error);
}

// ============================================================================
// Store Operations (Dual-Write)
// ============================================================================

/**
 * Store referral with dual-write to both KV and D1
 */
export async function storeReferralDual(
  env: Env,
  referral: ReferralInput,
): Promise<ReferralInput> {
  // Always write to KV first (primary during migration)
  const result = await storeInKV(env, referral);

  // Also write to D1 if available
  if (useD1Writes(env) && env.DEALS_DB) {
    try {
      // First, insert/update the deal
      const dealResult = await insertDeal(env.DEALS_DB, {
        deal_id: referral.id || `ref_${referral.code}`,
        title: referral.metadata?.title || `Referral: ${referral.code}`,
        description:
          referral.description || referral.metadata?.description || "",
        code: referral.code,
        url: referral.url,
        domain: referral.domain || new URL(referral.url).hostname,
        reward: {
          type:
            (referral.metadata?.reward_type as
              | "cash"
              | "credit"
              | "percent"
              | "item") || "cash",
          value:
            typeof referral.metadata?.reward_value === "number"
              ? referral.metadata.reward_value
              : 0,
          currency: "USD",
        },
        metadata: {
          category: referral.metadata?.category || ["referral"],
          tags: referral.metadata?.tags || [],
          normalized_at: new Date().toISOString(),
          confidence_score: referral.metadata?.confidence_score || 0.5,
          status:
            (referral.status as "active" | "quarantined" | "rejected") ||
            "active",
        },
        source: {
          url: referral.url,
          domain: referral.domain || "unknown",
          discovered_at: referral.submitted_at || new Date().toISOString(),
          trust_score: 0.5,
        },
        expiry: referral.expires_at
          ? {
              date: referral.expires_at,
              confidence: 0.5,
              type: "soft" as const,
            }
          : undefined,
      });

      // Then insert the referral code if deal was successful
      if (dealResult.success && dealResult.id) {
        await insertReferralCode(env.DEALS_DB, {
          ...referral,
          deal_id: dealResult.id,
        });
      }
    } catch (error) {
      // Log but don't fail - KV is still the primary
      await logDualWriteError(env, "storeReferral", error);
    }
  }

  return result;
}

// ============================================================================
// Read Operations (With Feature Flag)
// ============================================================================

/**
 * Get referral by ID (with read source selection)
 */
export async function getReferralById(
  env: Env,
  id: string,
): Promise<ReferralInput | null> {
  if (useD1Reads(env) && env.DEALS_DB) {
    try {
      // Query from D1
      const client = createD1Client(env.DEALS_DB);
      const result = await client.queryFirst<{
        id: string;
        code: string;
        url: string;
        domain: string;
        source: string;
        status: string;
        title: string;
        description: string;
        reward_type: string;
        reward_value: string;
        category: string;
        tags: string;
        submitted_at: string;
        submitted_by: string;
        expires_at: string;
        deactivated_at: string;
        deactivated_reason: string;
        metadata: string;
      }>(
        `SELECT 
          d.deal_id as id,
          rc.code,
          d.url,
          d.domain,
          d.source_url as source,
          rc.status,
          d.title,
          d.description,
          d.reward_type,
          d.reward_value,
          d.category,
          d.tags,
          datetime(rc.submitted_at, 'unixepoch') as submitted_at,
          rc.submitted_by,
          rc.expires_at,
          rc.deactivated_at,
          rc.deactivated_reason,
          rc.metadata
        FROM referral_codes rc
        JOIN deals d ON rc.deal_id = d.id
        WHERE d.deal_id = ?`,
        [id],
      );

      if (result.success && result.data) {
        const row = result.data;
        return {
          id: row.id,
          code: row.code,
          url: row.url,
          domain: row.domain,
          description: row.description,
          source: row.source,
          status: row.status,
          submitted_at: row.submitted_at,
          submitted_by: row.submitted_by,
          expires_at: row.expires_at,
          deactivated_at: row.deactivated_at,
          deactivated_reason: row.deactivated_reason,
          metadata: {
            title: row.title,
            description: row.description,
            reward_type: row.reward_type,
            reward_value: row.reward_value,
            category: row.category ? JSON.parse(row.category) : ["referral"],
            tags: row.tags ? JSON.parse(row.tags) : [],
          },
        };
      }
    } catch (error) {
      console.error("D1 read failed, falling back to KV:", error);
    }
  }

  // Fall back to KV
  return getFromKVById(env, id);
}

/**
 * Get referral by code (with read source selection)
 */
export async function getReferralByCode(
  env: Env,
  code: string,
): Promise<ReferralInput | null> {
  if (useD1Reads(env) && env.DEALS_DB) {
    try {
      const d1Result = await getReferralCodeByString(env.DEALS_DB, code);
      if (d1Result) {
        // Convert D1 result to ReferralInput format
        return {
          id: `ref_${d1Result.code}`,
          code: d1Result.code,
          url: "", // Would need full deal details
          domain: d1Result.domain,
          status: d1Result.status,
          metadata: {
            title: d1Result.deal_title,
          },
        };
      }
    } catch (error) {
      console.error("D1 read failed, falling back to KV:", error);
    }
  }

  // Fall back to KV
  return getFromKVByCode(env, code);
}

// ============================================================================
// Update Operations (Dual-Write)
// ============================================================================

/**
 * Update referral status with dual-write
 */
export async function updateReferralStatus(
  env: Env,
  id: string,
  newStatus: ReferralInput["status"],
  reason?: ReferralInput["deactivated_reason"],
  notes?: string,
): Promise<ReferralInput | null> {
  // Update in KV first
  const result = await updateInKV(env, id, newStatus, reason, notes);

  // Also update in D1 if available
  if (useD1Writes(env) && env.DEALS_DB && result) {
    try {
      const client = createD1Client(env.DEALS_DB);
      await client.execute(
        `UPDATE referral_codes 
         SET status = ?, 
             is_active = ?,
             deactivated_at = ?,
             deactivated_reason = ?,
             updated_at = strftime('%s', 'now')
         WHERE code = ?`,
        [
          newStatus,
          newStatus === "active" ? 1 : 0,
          newStatus !== "active" ? new Date().toISOString() : null,
          reason || null,
          result.code,
        ],
      );
    } catch (error) {
      await logDualWriteError(env, "updateReferralStatus", error);
    }
  }

  return result;
}

/**
 * Deactivate referral with dual-write
 */
export async function deactivateReferral(
  env: Env,
  code: string,
  reason: ReferralInput["deactivated_reason"],
  replacedBy?: string,
  notes?: string,
): Promise<ReferralInput | null> {
  // Deactivate in KV first
  const result = await deactivateInKV(env, code, reason, replacedBy, notes);

  // Also deactivate in D1 if available
  if (useD1Writes(env) && env.DEALS_DB && result) {
    try {
      const client = createD1Client(env.DEALS_DB);
      await client.execute(
        `UPDATE referral_codes 
         SET status = 'inactive',
             is_active = 0,
             deactivated_at = datetime('now'),
             deactivated_reason = ?,
             updated_at = strftime('%s', 'now')
         WHERE code = ?`,
        [reason || "manual", code],
      );
    } catch (error) {
      await logDualWriteError(env, "deactivateReferral", error);
    }
  }

  return result;
}

/**
 * Reactivate referral with dual-write
 */
export async function reactivateReferral(
  env: Env,
  code: string,
  notes?: string,
): Promise<ReferralInput | null> {
  // Reactivate in KV first
  const result = await reactivateInKV(env, code, notes);

  // Also reactivate in D1 if available
  if (useD1Writes(env) && env.DEALS_DB && result) {
    try {
      const client = createD1Client(env.DEALS_DB);
      await client.execute(
        `UPDATE referral_codes 
         SET status = 'active',
             is_active = 1,
             deactivated_at = NULL,
             deactivated_reason = NULL,
             updated_at = strftime('%s', 'now')
         WHERE code = ?`,
        [code],
      );
    } catch (error) {
      await logDualWriteError(env, "reactivateReferral", error);
    }
  }

  return result;
}

// ============================================================================
// D1-Only Queries (Advanced Features)
// ============================================================================

/**
 * Search referrals using D1 full-text search
 */
export async function searchReferralsD1(
  env: Env,
  query: string,
  options: {
    limit?: number;
    domain?: string;
    status?: string;
  } = {},
): Promise<ReferralInput[]> {
  if (!env.DEALS_DB) {
    return [];
  }

  try {
    const client = createD1Client(env.DEALS_DB);
    const limit = options.limit || 20;

    let sql = `
      SELECT 
        d.deal_id as id,
        rc.code,
        d.url,
        d.domain,
        d.source_url as source,
        rc.status,
        d.title,
        d.description,
        d.reward_type,
        d.reward_value,
        d.category,
        d.tags,
        datetime(rc.submitted_at, 'unixepoch') as submitted_at,
        rc.expires_at
      FROM fts_deals fts
      JOIN deals d ON fts.deal_id = d.deal_id
      LEFT JOIN referral_codes rc ON d.id = rc.deal_id
      WHERE fts_deals MATCH ?
    `;

    const params: unknown[] = [query];

    if (options.domain) {
      sql += ` AND d.domain = ?`;
      params.push(options.domain);
    }

    if (options.status) {
      sql += ` AND rc.status = ?`;
      params.push(options.status);
    } else {
      sql += ` AND d.is_active = 1`;
    }

    sql += ` ORDER BY fts.rank LIMIT ?`;
    params.push(limit);

    const result = await client.queryWithJson<{
      id: string;
      code: string;
      url: string;
      domain: string;
      source: string;
      status: string;
      title: string;
      description: string;
      reward_type: string;
      reward_value: number;
      category: string[];
      tags: string[];
      submitted_at: string;
      expires_at: string;
    }>(sql, params, ["category", "tags"]);

    if (result.success && result.data) {
      return result.data.map((row) => ({
        id: row.id,
        code: row.code,
        url: row.url,
        domain: row.domain,
        source: row.source,
        status: row.status,
        submitted_at: row.submitted_at,
        expires_at: row.expires_at,
        description: row.description,
        metadata: {
          title: row.title,
          description: row.description,
          reward_type: row.reward_type,
          reward_value: row.reward_value,
          category: row.category,
          tags: row.tags,
        },
      }));
    }

    return [];
  } catch (error) {
    console.error("D1 search error:", error);
    return [];
  }
}

/**
 * Get expiring referrals from D1
 */
export async function getExpiringReferralsD1(
  env: Env,
  days: number = 30,
): Promise<ReferralInput[]> {
  if (!env.DEALS_DB) {
    return [];
  }

  try {
    const client = createD1Client(env.DEALS_DB);
    const result = await client.query<{
      code: string;
      domain: string;
      title: string;
      expires_at: string;
      days_remaining: number;
    }>(
      `SELECT 
        rc.code,
        d.domain,
        d.title,
        rc.expires_at,
        julianday(rc.expires_at) - julianday('now') as days_remaining
      FROM referral_codes rc
      JOIN deals d ON rc.deal_id = d.id
      WHERE rc.expires_at IS NOT NULL
      AND rc.expires_at > datetime('now')
      AND rc.expires_at <= datetime('now', '+' || ? || ' days')
      AND rc.is_active = 1
      ORDER BY days_remaining ASC`,
      [days],
    );

    if (result.success && result.data) {
      return result.data.map(
        (row: {
          code: string;
          domain: string;
          title: string;
          expires_at: string;
        }) => ({
          code: row.code,
          url: `https://${row.domain}`, // Construct minimal URL
          domain: row.domain,
          expires_at: row.expires_at,
          metadata: {
            title: row.title,
          },
        }),
      );
    }

    return [];
  } catch (error) {
    console.error("D1 expiring referrals error:", error);
    return [];
  }
}

/**
 * Get referral statistics from D1
 */
export async function getReferralStatsD1(env: Env): Promise<{
  total: number;
  active: number;
  byDomain: Array<{ domain: string; count: number }>;
}> {
  if (!env.DEALS_DB) {
    return { total: 0, active: 0, byDomain: [] };
  }

  try {
    const client = createD1Client(env.DEALS_DB);

    const [statsResult, domainResult] = await Promise.all([
      client.queryFirst<{
        total: number;
        active: number;
      }>(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' AND is_active = 1 THEN 1 ELSE 0 END) as active
        FROM referral_codes`,
      ),
      client.query<{ domain: string; count: number }>(
        `SELECT 
          d.domain,
          COUNT(*) as count
        FROM referral_codes rc
        JOIN deals d ON rc.deal_id = d.id
        WHERE rc.is_active = 1
        GROUP BY d.domain
        ORDER BY count DESC`,
      ),
    ]);

    return {
      total:
        statsResult.success && statsResult.data ? statsResult.data.total : 0,
      active:
        statsResult.success && statsResult.data ? statsResult.data.active : 0,
      byDomain:
        domainResult.success && domainResult.data ? domainResult.data : [],
    };
  } catch (error) {
    console.error("D1 referral stats error:", error);
    return { total: 0, active: 0, byDomain: [] };
  }
}
