/**
 * Analytics Queries
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1ReadClient } from "./client";
import type { DealSearchResult } from "./types";

/**
 * Get top domains by deal count
 */
export async function getTopDomains(
  db: D1Database,
  limit: number = 10,
): Promise<Array<{ domain: string; deals: number; referrals: number }>> {
  const client = createD1ReadClient(db);

  const result = await client.query<{
    domain: string;
    deals: number;
    referrals: number;
  }>(
    `SELECT 
      d.domain,
      COUNT(DISTINCT d.id) as deals,
      COUNT(DISTINCT rc.id) as referrals
    FROM deals d
    LEFT JOIN referral_codes rc ON d.id = rc.deal_id
    WHERE d.is_active = 1
    GROUP BY d.domain
    ORDER BY deals DESC
    LIMIT ?`,
    [limit],
  );

  return result.success ? result.data || [] : [];
}

/**
 * Get referral usage statistics
 */
export async function getReferralUsageStats(
  db: D1Database,
  days: number = 30,
): Promise<{
  totalUses: number;
  uniqueUsers: number;
  byDay: Array<{ date: string; count: number }>;
}> {
  const client = createD1ReadClient(db);

  const totalResult = await client.queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM referral_usage
     WHERE used_at >= strftime('%s', 'now', '-' || ? || ' days')`,
    [days],
  );

  const uniqueResult = await client.queryFirst<{ count: number }>(
    `SELECT COUNT(DISTINCT used_by) as count
     FROM referral_usage
     WHERE used_at >= strftime('%s', 'now', '-' || ? || ' days')`,
    [days],
  );

  const byDayResult = await client.query<{ date: string; count: number }>(
    `SELECT 
      date(datetime(used_at, 'unixepoch')) as date,
      COUNT(*) as count
     FROM referral_usage
     WHERE used_at >= strftime('%s', 'now', '-' || ? || ' days')
     GROUP BY date
     ORDER BY date`,
    [days],
  );

  return {
    totalUses:
      totalResult.success && totalResult.data ? totalResult.data.count : 0,
    uniqueUsers:
      uniqueResult.success && uniqueResult.data ? uniqueResult.data.count : 0,
    byDay: byDayResult.success ? byDayResult.data || [] : [],
  };
}

/**
 * Get similar deals from D1 based on category and domain
 */
export async function getSimilarDealsD1(
  db: D1Database,
  dealId: string,
  options: {
    limit?: number;
    includeExpired?: boolean;
  } = {},
): Promise<DealSearchResult[]> {
  const client = createD1ReadClient(db);
  const limit = options.limit || 5;

  const refResult = await client.queryFirst<{
    category: string[];
    domain: string;
  }>(`SELECT category, domain FROM deals WHERE deal_id = ?`, [dealId]);

  if (!refResult.success || !refResult.data) {
    return [];
  }

  const categories = refResult.data.category || [];
  const domain = refResult.data.domain;

  const categoryConditions = categories
    .map((_, i) => `category LIKE ?`)
    .join(" OR ");

  const params: unknown[] = [];
  if (categoryConditions) {
    for (const cat of categories) {
      params.push(`%"${cat}"%`);
    }
  }
  params.push(domain);
  params.push(dealId);
  params.push(limit);

  let sql = `
    SELECT 
      id, deal_id, title, description, domain, code, url,
      reward_type, reward_value, reward_currency, status,
      category, tags, expiry_date, confidence_score
    FROM deals
    WHERE is_active = 1
    ${categoryConditions ? `AND (${categoryConditions})` : ""}
    ${!options.includeExpired ? `AND (expiry_date IS NULL OR expiry_date > datetime('now'))` : ""}
    AND domain = ?
    AND deal_id != ?
    ORDER BY confidence_score DESC
    LIMIT ?
  `;

  const result = await client.queryWithJson<DealSearchResult>(sql, params, [
    "category",
    "tags",
  ]);

  return result.success ? result.data || [] : [];
}

/**
 * Get recommended deals for a user based on browsing history
 * (simplified - in production would use Vectorize embeddings)
 */
export async function getRecommendedDealsD1(
  db: D1Database,
  viewedDomains: string[],
  options: {
    limit?: number;
    excludeViewed?: boolean;
  } = {},
): Promise<DealSearchResult[]> {
  const client = createD1ReadClient(db);
  const limit = options.limit || 10;

  if (viewedDomains.length === 0) {
    const result = await client.queryWithJson<DealSearchResult>(
      `SELECT 
        id, deal_id, title, description, domain, code, url,
        reward_type, reward_value, reward_currency, status,
        category, tags, expiry_date, confidence_score
      FROM deals
      WHERE is_active = 1
      AND (expiry_date IS NULL OR expiry_date > datetime('now'))
      ORDER BY confidence_score DESC
      LIMIT ?`,
      [limit],
      ["category", "tags"],
    );
    return result.success ? result.data || [] : [];
  }

  const domainPlaceholders = viewedDomains.map(() => "?").join(",");
  const params = [...viewedDomains, limit];

  const sql = `
    SELECT 
      id, deal_id, title, description, domain, code, url,
      reward_type, reward_value, reward_currency, status,
      category, tags, expiry_date, confidence_score
    FROM deals
    WHERE is_active = 1
    AND domain IN (${domainPlaceholders})
    AND (expiry_date IS NULL OR expiry_date > datetime('now'))
    ORDER BY confidence_score DESC
    LIMIT ?
  `;

  const result = await client.queryWithJson<DealSearchResult>(sql, params, [
    "category",
    "tags",
  ]);

  return result.success ? result.data || [] : [];
}

/**
 * Get trending deals (high activity recently)
 */
export async function getTrendingDealsD1(
  db: D1Database,
  days: number = 7,
  limit: number = 10,
): Promise<DealSearchResult[]> {
  const client = createD1ReadClient(db);

  const result = await client.queryWithJson<DealSearchResult>(
    `SELECT 
      d.id, d.deal_id, d.title, d.description, d.domain, d.code, d.url,
      d.reward_type, d.reward_value, d.reward_currency, d.status,
      d.category, d.tags, d.expiry_date, d.confidence_score,
      COUNT(ru.id) as recent_uses
    FROM deals d
    LEFT JOIN referral_usage ru ON d.id = ru.deal_id
      AND ru.used_at >= strftime('%s', 'now', '-' || ? || ' days')
    WHERE d.is_active = 1
    AND (d.expiry_date IS NULL OR d.expiry_date > datetime('now'))
    GROUP BY d.id
    ORDER BY recent_uses DESC, d.confidence_score DESC
    LIMIT ?`,
    [days, limit],
    ["category", "tags"],
  );

  return result.success ? result.data || [] : [];
}
