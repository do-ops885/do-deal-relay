/**
 * Common D1 Query Patterns for Deal Discovery
 * Full-text search, filtering, and analytics queries
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1Client, createD1ReadClient, QueryResult } from "./client";
import type { Deal, ReferralInput } from "../../types";

// ============================================================================
// Type Definitions
// ============================================================================

export interface DealSearchResult {
  id: number;
  deal_id: string;
  title: string;
  description: string;
  domain: string;
  code: string;
  url: string;
  reward_type: string;
  reward_value: number;
  reward_currency: string;
  status: string;
  category: string[];
  tags: string[];
  relevance?: number;
  expiry_date?: string;
  confidence_score: number;
}

export interface DealStats {
  total: number;
  active: number;
  quarantined: number;
  rejected: number;
  expired: number;
  byDomain: Array<{
    domain: string;
    count: number;
  }>;
  byCategory: Array<{
    name: string;
    count: number;
  }>;
  byRewardType: Array<{
    type: string;
    count: number;
  }>;
}

export interface ExpiringDeal {
  id: number;
  deal_id: string;
  title: string;
  domain: string;
  expiry_date: string;
  days_remaining: number;
  code: string;
}

export interface ReferralCodeResult {
  id: number;
  code: string;
  deal_id: number;
  deal_title: string;
  domain: string;
  status: string;
  max_uses: number;
  current_uses: number;
  use_count: number;
  expires_at?: string;
  days_remaining?: number;
}

// ============================================================================
// Full-Text Search Queries
// ============================================================================

/**
 * Full-text search using FTS5
 */
export async function searchDeals(
  db: D1Database,
  query: string,
  options: {
    limit?: number;
    includeExpired?: boolean;
    status?: string;
  } = {},
): Promise<DealSearchResult[]> {
  const client = createD1ReadClient(db);
  const limit = options.limit || 20;

  let sql = `
    SELECT 
      d.id,
      d.deal_id,
      d.title,
      d.description,
      d.domain,
      d.code,
      d.url,
      d.reward_type,
      d.reward_value,
      d.reward_currency,
      d.status,
      d.category,
      d.tags,
      d.expiry_date,
      d.confidence_score,
      fts.rank as relevance
    FROM fts_deals fts
    JOIN deals d ON fts.deal_id = d.deal_id
    WHERE fts_deals MATCH ?
  `;

  const params: unknown[] = [query];

  if (!options.includeExpired) {
    sql += ` AND (d.expiry_date IS NULL OR d.expiry_date > datetime('now'))`;
  }

  if (options.status) {
    sql += ` AND d.status = ?`;
    params.push(options.status);
  } else {
    sql += ` AND d.is_active = 1`;
  }

  sql += ` ORDER BY fts.rank LIMIT ?`;
  params.push(limit);

  const result = await client.queryWithJson<DealSearchResult>(sql, params, [
    "category",
    "tags",
  ]);

  return result.success ? result.data || [] : [];
}

/**
 * Autocomplete suggestions based on FTS5 prefix search
 */
export async function getSearchSuggestions(
  db: D1Database,
  partial: string,
  limit: number = 10,
): Promise<string[]> {
  const client = createD1ReadClient(db);

  const result = await client.query<{ title: string }>(
    `SELECT DISTINCT title 
     FROM fts_deals 
     WHERE fts_deals MATCH ? || '*'
     AND title IS NOT NULL
     LIMIT ?`,
    [partial, limit],
  );

  return result.success && result.data
    ? result.data.map((r) => r.title).filter((t): t is string => t !== null)
    : [];
}

// ============================================================================
// Domain and Category Queries
// ============================================================================

/**
 * Get deals by domain
 */
export async function getDealsByDomain(
  db: D1Database,
  domain: string,
  options: {
    limit?: number;
    activeOnly?: boolean;
  } = {},
): Promise<DealSearchResult[]> {
  const client = createD1ReadClient(db);
  const limit = options.limit || 50;

  let sql = `
    SELECT 
      id, deal_id, title, description, domain, code, url,
      reward_type, reward_value, reward_currency, status,
      category, tags, expiry_date, confidence_score
    FROM deals
    WHERE domain = ?
  `;

  const params: unknown[] = [domain];

  if (options.activeOnly !== false) {
    sql += ` AND is_active = 1 AND status = 'active'`;
  }

  sql += ` ORDER BY confidence_score DESC, created_at DESC LIMIT ?`;
  params.push(limit);

  const result = await client.queryWithJson<DealSearchResult>(sql, params, [
    "category",
    "tags",
  ]);

  return result.success ? result.data || [] : [];
}

/**
 * Get deals by category
 */
export async function getDealsByCategory(
  db: D1Database,
  category: string,
  options: {
    limit?: number;
    activeOnly?: boolean;
  } = {},
): Promise<DealSearchResult[]> {
  const client = createD1ReadClient(db);
  const limit = options.limit || 50;

  const result = await client.queryWithJson<DealSearchResult>(
    `SELECT 
      id, deal_id, title, description, domain, code, url,
      reward_type, reward_value, reward_currency, status,
      category, tags, expiry_date, confidence_score
    FROM deals
    WHERE (
      json_extract(category, '$') LIKE ? 
      OR category LIKE ?
    )
    AND is_active = ?
    ${options.activeOnly !== false ? "AND status = 'active'" : ""}
    ORDER BY confidence_score DESC
    LIMIT ?`,
    [
      `%"${category}"%`,
      `%${category}%`,
      options.activeOnly !== false ? 1 : 0,
      limit,
    ],
    ["category", "tags"],
  );

  return result.success ? result.data || [] : [];
}

/**
 * Get all domains with deal counts
 */
export async function getDomainsWithCounts(
  db: D1Database,
): Promise<Array<{ domain: string; count: number }>> {
  const client = createD1ReadClient(db);

  const result = await client.query<{ domain: string; count: number }>(
    `SELECT domain, COUNT(*) as count
     FROM deals
     WHERE is_active = 1
     GROUP BY domain
     ORDER BY count DESC`,
  );

  return result.success ? result.data || [] : [];
}

/**
 * Get all categories with deal counts
 */
export async function getCategoriesWithCounts(
  db: D1Database,
): Promise<Array<{ name: string; count: number }>> {
  const client = createD1ReadClient(db);

  // Query distinct categories from deals
  const result = await client.query<{ categories: string }>(
    `SELECT DISTINCT category as categories
     FROM deals
     WHERE category IS NOT NULL AND is_active = 1`,
  );

  if (!result.success || !result.data) {
    return [];
  }

  // Parse JSON categories and count
  const counts = new Map<string, number>();

  for (const row of result.data) {
    try {
      const cats = JSON.parse(row.categories) as string[];
      for (const cat of cats) {
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
    } catch {
      // If not valid JSON, treat as comma-separated
      const cats = row.categories.split(",").map((c) => c.trim());
      for (const cat of cats) {
        if (cat) {
          counts.set(cat, (counts.get(cat) || 0) + 1);
        }
      }
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// ============================================================================
// Status-Based Queries
// ============================================================================

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

// ============================================================================
// Statistics Queries
// ============================================================================

/**
 * Get comprehensive deal statistics
 */
export async function getDealStats(db: D1Database): Promise<DealStats> {
  const client = createD1ReadClient(db);

  // Get main stats
  const statsResult = await client.query<{
    total: number;
    active: number;
    quarantined: number;
    rejected: number;
    expired: number;
  }>(
    `SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' AND is_active = 1 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) as quarantined,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'expired' OR (expiry_date < datetime('now') AND expiry_date IS NOT NULL) THEN 1 ELSE 0 END) as expired
    FROM deals`,
  );

  // Get domain breakdown
  const domainResult = await client.query<{ domain: string; count: number }>(
    `SELECT domain, COUNT(*) as count
     FROM deals
     WHERE is_active = 1
     GROUP BY domain
     ORDER BY count DESC
     LIMIT 10`,
  );

  // Get reward type breakdown
  const rewardResult = await client.query<{ type: string; count: number }>(
    `SELECT reward_type as type, COUNT(*) as count
     FROM deals
     WHERE reward_type IS NOT NULL AND is_active = 1
     GROUP BY reward_type
     ORDER BY count DESC`,
  );

  const stats =
    statsResult.success && statsResult.data
      ? statsResult.data[0]
      : { total: 0, active: 0, quarantined: 0, rejected: 0, expired: 0 };

  return {
    total: stats.total || 0,
    active: stats.active || 0,
    quarantined: stats.quarantined || 0,
    rejected: stats.rejected || 0,
    expired: stats.expired || 0,
    byDomain: domainResult.success ? domainResult.data || [] : [],
    byCategory: await getCategoriesWithCounts(db),
    byRewardType: rewardResult.success ? rewardResult.data || [] : [],
  };
}

/**
 * Get time-series statistics
 */
export async function getDealTimeSeries(
  db: D1Database,
  days: number = 30,
): Promise<Array<{ date: string; count: number; new_count: number }>> {
  const client = createD1ReadClient(db);

  const result = await client.query<{
    date: string;
    count: number;
    new_count: number;
  }>(
    `WITH RECURSIVE dates(date) AS (
      SELECT date('now', '-' || ? || ' days')
      UNION ALL
      SELECT date(date, '+1 day')
      FROM dates
      WHERE date < date('now')
    )
    SELECT 
      dates.date,
      (SELECT COUNT(*) FROM deals 
       WHERE date(datetime(created_at, 'unixepoch')) <= dates.date) as count,
      (SELECT COUNT(*) FROM deals 
       WHERE date(datetime(created_at, 'unixepoch')) = dates.date) as new_count
    FROM dates
    ORDER BY dates.date`,
    [days],
  );

  return result.success ? result.data || [] : [];
}

// ============================================================================
// Insert/Update Queries
// ============================================================================

/**
 * Insert a new deal with conflict handling
 */
export async function insertDeal(
  db: D1Database,
  deal: Partial<Deal> & {
    deal_id: string;
    title: string;
    url: string;
    domain: string;
  },
): Promise<{ success: boolean; id?: number; error?: string }> {
  const client = createD1Client(db);

  const now = Math.floor(Date.now() / 1000);

  const result = await client.execute(
    `INSERT INTO deals (
      deal_id, title, description, code, url, domain, 
      source_url, source_trust_score,
      reward_type, reward_value, reward_currency, reward_description,
      category, tags, status, is_active,
      expiry_date, expiry_confidence, expiry_type,
      requirements, normalized_at, confidence_score, raw_data,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, json(?), json(?), ?, ?, ?, ?, ?, json(?), ?, ?, ?, ?, ?)
    ON CONFLICT(deal_id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      code = excluded.code,
      url = excluded.url,
      reward_type = excluded.reward_type,
      reward_value = excluded.reward_value,
      reward_currency = excluded.reward_currency,
      reward_description = excluded.reward_description,
      category = excluded.category,
      tags = excluded.tags,
      status = excluded.status,
      is_active = excluded.is_active,
      expiry_date = excluded.expiry_date,
      expiry_confidence = excluded.expiry_confidence,
      expiry_type = excluded.expiry_type,
      requirements = excluded.requirements,
      normalized_at = excluded.normalized_at,
      confidence_score = excluded.confidence_score,
      raw_data = excluded.raw_data,
      updated_at = excluded.updated_at`,
    [
      deal.deal_id,
      deal.title,
      deal.description || null,
      deal.code || null,
      deal.url,
      deal.domain,
      deal.source?.url || null,
      deal.source?.trust_score || 0.5,
      deal.reward?.type || null,
      typeof deal.reward?.value === "number" ? deal.reward.value : null,
      deal.reward?.currency || "USD",
      deal.reward?.description || null,
      JSON.stringify(deal.metadata?.category || []),
      JSON.stringify(deal.metadata?.tags || []),
      deal.metadata?.status || "active",
      deal.metadata?.status === "active" ? 1 : 0,
      deal.expiry?.date || null,
      deal.expiry?.confidence || 0.5,
      deal.expiry?.type || "unknown",
      JSON.stringify(deal.requirements || []),
      deal.metadata?.normalized_at || new Date().toISOString(),
      deal.metadata?.confidence_score || 0.5,
      JSON.stringify(deal),
      now,
      now,
    ],
  );

  if (result.success) {
    return {
      success: true,
      id: result.lastRowId,
    };
  }

  return {
    success: false,
    error: result.error || "Insert failed",
  };
}

/**
 * Insert a referral code
 */
export async function insertReferralCode(
  db: D1Database,
  referral: ReferralInput & { deal_id: number },
): Promise<{ success: boolean; id?: number; error?: string }> {
  const client = createD1Client(db);

  const now = Math.floor(Date.now() / 1000);

  const result = await client.execute(
    `INSERT INTO referral_codes (
      code, deal_id, user_id, submitted_by,
      max_uses, current_uses, use_count,
      status, is_active,
      expires_at,
      title, description, reward_type, reward_value,
      metadata,
      submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, json(?), ?)
    ON CONFLICT(code) DO UPDATE SET
      deal_id = excluded.deal_id,
      status = excluded.status,
      is_active = excluded.is_active,
      max_uses = excluded.max_uses,
      expires_at = excluded.expires_at,
      metadata = excluded.metadata,
      updated_at = strftime('%s', 'now')`,
    [
      referral.code,
      referral.deal_id,
      referral.submitted_by || null,
      referral.submitted_by || null,
      null, // max_uses
      0, // current_uses
      0, // use_count
      referral.status || "active",
      referral.status === "active" ? 1 : 0,
      referral.expires_at || null,
      referral.metadata?.title || null,
      referral.description || referral.metadata?.description || null,
      referral.metadata?.reward_type || null,
      referral.metadata?.reward_value?.toString() || null,
      JSON.stringify(referral.metadata || {}),
      referral.submitted_at
        ? Math.floor(new Date(referral.submitted_at).getTime() / 1000)
        : now,
    ],
  );

  if (result.success) {
    return {
      success: true,
      id: result.lastRowId,
    };
  }

  return {
    success: false,
    error: result.error || "Insert failed",
  };
}

// ============================================================================
// Referral Code Queries
// ============================================================================

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

// ============================================================================
// Analytics Queries
// ============================================================================

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

  // Get the reference deal's categories
  const refResult = await client.queryFirst<{
    category: string[];
    domain: string;
  }>(`SELECT category, domain FROM deals WHERE deal_id = ?`, [dealId]);

  if (!refResult.success || !refResult.data) {
    return [];
  }

  const categories = refResult.data.category || [];
  const domain = refResult.data.domain;

  // Build category filter
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
    // No history - return top deals
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

  // Build domain filter
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
