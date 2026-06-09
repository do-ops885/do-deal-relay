/**
 * Domain and Category Queries
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1ReadClient } from "./client";
import type { DealSearchResult } from "./types";

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

  const result = await client.query<{ categories: string }>(
    `SELECT DISTINCT category as categories
     FROM deals
     WHERE category IS NOT NULL AND is_active = 1`,
  );

  if (!result.success || !result.data) {
    return [];
  }

  const counts = new Map<string, number>();

  for (const row of result.data) {
    try {
      const cats = JSON.parse(row.categories) as string[];
      for (const cat of cats) {
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
    } catch {
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
