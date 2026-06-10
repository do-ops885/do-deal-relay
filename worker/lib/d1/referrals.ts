/**
 * Referral Code Queries
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1ReadClient } from "./client";
import type { ReferralCodeResult } from "./types";

/**
 * Get referral codes by deal ID
 */
export async function getReferralCodesByDeal(
  db: D1Database,
  dealId: number,
  activeOnly: boolean = true,
): Promise<ReferralCodeResult[]> {
  const client = createD1ReadClient(db);

  let sql = `
    SELECT 
      rc.id,
      rc.code,
      rc.deal_id,
      d.title as deal_title,
      d.domain,
      rc.status,
      rc.max_uses,
      rc.current_uses,
      rc.use_count,
      rc.expires_at,
      CASE 
        WHEN rc.expires_at IS NOT NULL THEN 
          julianday(rc.expires_at) - julianday('now')
        ELSE NULL 
      END as days_remaining
    FROM referral_codes rc
    JOIN deals d ON rc.deal_id = d.id
    WHERE rc.deal_id = ?
  `;

  const params: unknown[] = [dealId];

  if (activeOnly) {
    sql += ` AND rc.is_active = 1 AND rc.status = 'active'`;
  }

  sql += ` ORDER BY rc.created_at DESC`;

  const result = await client.query<ReferralCodeResult>(sql, params);

  return result.success ? result.data || [] : [];
}

/**
 * Get referral code by code string
 */
export async function getReferralCodeByString(
  db: D1Database,
  code: string,
): Promise<ReferralCodeResult | null> {
  const client = createD1ReadClient(db);

  const result = await client.queryFirst<ReferralCodeResult>(
    `SELECT 
      rc.id,
      rc.code,
      rc.deal_id,
      d.title as deal_title,
      d.domain,
      rc.status,
      rc.max_uses,
      rc.current_uses,
      rc.use_count,
      rc.expires_at,
      CASE 
        WHEN rc.expires_at IS NOT NULL THEN 
          julianday(rc.expires_at) - julianday('now')
        ELSE NULL 
      END as days_remaining
    FROM referral_codes rc
    JOIN deals d ON rc.deal_id = d.id
    WHERE rc.code = ? COLLATE NOCASE`,
    [code],
  );

  return result.success ? result.data || null : null;
}
