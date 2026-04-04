/**
 * NLQ Query Builder - SQL Generation
 *
 * Generates SQL WHERE and ORDER BY clauses from structured queries.
 */

import { StructuredQuery } from "../types";

/**
 * Build SQL WHERE clause from structured query filters.
 *
 * @param query - Structured query
 * @returns SQL WHERE clause components
 */
export function buildWhereClause(query: StructuredQuery): {
  whereClauses: string[];
  params: unknown[];
} {
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  // Status filter
  if (query.status && query.status !== "all") {
    whereClauses.push("d.status = ?");
    params.push(query.status);
  } else {
    whereClauses.push("d.is_active = 1");
  }

  // Expiry filter
  if (!query.includeExpired) {
    whereClauses.push(
      "(d.expiry_date IS NULL OR d.expiry_date > datetime('now'))",
    );
  }

  // Category filter - use JSON extraction
  if (query.categories && query.categories.length > 0) {
    const categoryConditions = query.categories
      .map(() => "json_extract(d.category, '$') LIKE ?")
      .join(" OR ");
    whereClauses.push(`(${categoryConditions})`);
    for (const cat of query.categories) {
      params.push(`%"${cat}"%`);
    }
  }

  // Domain filter
  if (query.domains && query.domains.length > 0) {
    whereClauses.push(
      `d.domain IN (${query.domains.map(() => "?").join(", ")})`,
    );
    params.push(...query.domains);
  }

  // Reward type filter
  if (query.rewardTypes && query.rewardTypes.length > 0) {
    whereClauses.push(
      `d.reward_type IN (${query.rewardTypes.map(() => "?").join(", ")})`,
    );
    params.push(...query.rewardTypes);
  }

  // Reward value filters
  if (query.minRewardValue !== undefined) {
    whereClauses.push("d.reward_value >= ?");
    params.push(query.minRewardValue);
  }

  if (
    query.maxRewardValue !== undefined &&
    query.maxRewardValue !== query.minRewardValue
  ) {
    whereClauses.push("d.reward_value <= ?");
    params.push(query.maxRewardValue);
  }

  // Apply additional filter conditions
  for (const filter of query.filters) {
    if (filter.field === "expiry_days" && typeof filter.value === "number") {
      // Special handling for expiring deals
      whereClauses.push(
        "d.expiry_date IS NOT NULL AND d.expiry_date <= datetime('now', '+? days')",
      );
      params.push(filter.value);
    }
  }

  return { whereClauses, params };
}

/**
 * Build SQL ORDER BY clause from structured query.
 *
 * @param query - Structured query
 * @returns SQL ORDER BY clause
 */
export function buildOrderByClause(query: StructuredQuery): string {
  const { sortBy, sortOrder } = query;

  switch (sortBy) {
    case "confidence_score":
      return `ORDER BY d.confidence_score ${sortOrder.toUpperCase()}, fts.rank`;
    case "reward_value":
      return `ORDER BY d.reward_value ${sortOrder.toUpperCase()}, fts.rank`;
    case "created_at":
      return `ORDER BY d.created_at ${sortOrder.toUpperCase()}`;
    case "expiry_date":
      return `ORDER BY d.expiry_date ${sortOrder.toUpperCase()}`;
    case "title":
      return `ORDER BY d.title ${sortOrder.toUpperCase()}`;
    case "relevance":
    default:
      return "ORDER BY fts.rank";
  }
}
