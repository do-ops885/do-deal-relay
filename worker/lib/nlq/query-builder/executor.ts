/**
 * NLQ Query Builder - Query Execution
 *
 * Executes structured queries against the D1 database.
 * Combines FTS5 text search with structured filtering.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { StructuredQuery, RewardType } from "../types";
import { searchDeals, DealSearchResult } from "../../d1/queries";
import { buildWhereClause, buildOrderByClause } from "./sql";

/**
 * Execute a structured query against the D1 database.
 *
 * Combines FTS5 text search with structured filtering for
 * optimal natural language query performance.
 *
 * @param db - D1 database instance
 * @param query - Structured query
 * @returns Search results
 * @example
 * ```typescript
 * const results = await executeStructuredQuery(env.DEALS_DB, structured);
 * // Returns matching deals with relevance scoring
 * ```
 */
export async function executeStructuredQuery(
  db: D1Database,
  query: StructuredQuery,
): Promise<DealSearchResult[]> {
  // If we have a text query, use FTS5
  if (query.textQuery) {
    // Use the existing search function with additional filtering
    const baseResults = await searchDeals(db, query.textQuery, {
      limit: query.limit * 2, // Get more results for post-filtering
      includeExpired: query.includeExpired,
      status: query.status,
    });

    // Apply additional filters
    let filtered = baseResults;

    // Filter by category
    if (query.categories && query.categories.length > 0) {
      filtered = filtered.filter((deal) => {
        if (!deal.category) return false;
        return query.categories!.some((cat) => deal.category.includes(cat));
      });
    }

    // Filter by domain
    if (query.domains && query.domains.length > 0) {
      filtered = filtered.filter((deal) =>
        query.domains!.includes(deal.domain.toLowerCase()),
      );
    }

    // Filter by reward type
    if (query.rewardTypes && query.rewardTypes.length > 0) {
      filtered = filtered.filter((deal) =>
        query.rewardTypes!.includes(deal.reward_type as RewardType),
      );
    }

    // Filter by reward value
    if (query.minRewardValue !== undefined) {
      filtered = filtered.filter(
        (deal) => deal.reward_value >= query.minRewardValue!,
      );
    }

    if (query.maxRewardValue !== undefined) {
      filtered = filtered.filter(
        (deal) => deal.reward_value <= query.maxRewardValue!,
      );
    }

    // Apply sorting if not relevance
    if (query.sortBy !== "relevance") {
      filtered.sort((a, b) => {
        let comparison = 0;
        switch (query.sortBy) {
          case "confidence_score":
            comparison = (a.confidence_score || 0) - (b.confidence_score || 0);
            break;
          case "reward_value":
            comparison = (a.reward_value || 0) - (b.reward_value || 0);
            break;
          case "title":
            comparison = a.title.localeCompare(b.title);
            break;
        }
        return query.sortOrder === "desc" ? -comparison : comparison;
      });
    }

    // Apply pagination
    const offsetResults = filtered.slice(
      query.offset,
      query.offset + query.limit,
    );

    return offsetResults;
  }

  // No text query - use category/domain filters only
  return executeFilterOnlyQuery(db, query);
}

/**
 * Execute a filter-only query when no text search is provided.
 */
async function executeFilterOnlyQuery(
  db: D1Database,
  query: StructuredQuery,
): Promise<DealSearchResult[]> {
  // Import D1 client dynamically to avoid circular dependencies
  const { createD1ReadClient } = await import("../../d1/client");
  const client = createD1ReadClient(db);

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
      NULL as relevance
    FROM deals d
    WHERE 1=1
  `;

  const { whereClauses, params } = buildWhereClause(query);

  for (const clause of whereClauses) {
    sql += ` AND ${clause}`;
  }

  // Add sorting
  const orderBy = buildOrderByClause(query).replace(
    "fts.rank",
    "d.confidence_score DESC",
  );
  sql += ` ${orderBy}`;

  // Add pagination
  sql += ` LIMIT ? OFFSET ?`;
  params.push(query.limit, query.offset);

  const result = await client.queryWithJson<DealSearchResult>(sql, params, [
    "category",
    "tags",
  ]);

  return result.success ? result.data || [] : [];
}
