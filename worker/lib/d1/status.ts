/**
 * Status-Based Queries
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1ReadClient } from "./client";
import type { DealSearchResult, ExpiringDeal } from "./types";

/**
 * Get active deals only
 */
export async function getActiveDeals(
  db: D1Database,
  limit: number = 100,
): Promise<DealSearchResult[]> {
  const client = createD1ReadClient(db);

  const result = await client.queryWithJson<DealSearchResult>(
    `SELECT 
      id, deal_id, title, description, domain, code, url,
      reward_type, reward_value, reward_currency, status,
      category, tags, expiry_date, confidence_score
    FROM deals
    WHERE is_active = 1 
    AND status = 'active'
    AND (expiry_date IS NULL OR expiry_date > datetime('now'))
    ORDER BY confidence_score DESC, created_at DESC
    LIMIT ?`,
    [limit],
    ["category", "tags"],
  );

  return result.success ? result.data || [] : [];
}

/**
 * Get deals expiring within N days
 */
export async function getExpiringDeals(
  db: D1Database,
  days: number = 7,
): Promise<ExpiringDeal[]> {
  const client = createD1ReadClient(db);

  const result = await client.query<ExpiringDeal>(
    `SELECT 
      d.id,
      d.deal_id,
      d.title,
      d.domain,
      d.expiry_date,
      d.code,
      julianday(d.expiry_date) - julianday('now') as days_remaining
    FROM deals d
    WHERE d.expiry_date IS NOT NULL
    AND d.expiry_date > datetime('now')
    AND d.expiry_date <= datetime('now', '+' || ? || ' days')
    AND d.is_active = 1
    ORDER BY days_remaining ASC`,
    [days],
  );

  return result.success ? result.data || [] : [];
}

/**
 * Get recently added deals
 */
export async function getRecentDeals(
  db: D1Database,
  days: number = 7,
  limit: number = 50,
): Promise<DealSearchResult[]> {
  const client = createD1ReadClient(db);

  const result = await client.queryWithJson<DealSearchResult>(
    `SELECT 
      id, deal_id, title, description, domain, code, url,
      reward_type, reward_value, reward_currency, status,
      category, tags, expiry_date, confidence_score
    FROM deals
    WHERE created_at >= strftime('%s', 'now', '-' || ? || ' days')
    AND is_active = 1
    ORDER BY created_at DESC
    LIMIT ?`,
    [days, limit],
    ["category", "tags"],
  );

  return result.success ? result.data || [] : [];
}
