/**
 * Full-Text Search Queries
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1ReadClient } from "./client";
import type { DealSearchResult } from "./types";

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
