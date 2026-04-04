/**
 * NLQ Query Builder
 *
 * Converts parsed natural language queries into D1 SQL statements.
 * Uses FTS5 for full-text search with structured filtering.
 */

import type { D1Database } from "@cloudflare/workers-types";
import {
  ParsedQuery,
  StructuredQuery,
  NLQConfig,
  DEFAULT_NLQ_CONFIG,
  RewardType,
  Token,
} from "../types";
import { getTopEntities, cleanQueryForSearch } from "../parser";
import { isRankingQuery, extractRankingCriteria } from "../intent";
import { buildWhereClause, buildOrderByClause } from "./sql";
import { executeStructuredQuery } from "./executor";
import { explainQuery } from "./explanation";

export { buildWhereClause, buildOrderByClause } from "./sql";
export { executeStructuredQuery } from "./executor";
export { explainQuery } from "./explanation";

/**
 * Build a structured query from a parsed NLQ.
 *
 * Converts the parsed entities and intent into a structured
 * query object that can be executed against the database.
 *
 * @param parsed - Parsed query with entities and intent
 * @param config - NLQ configuration
 * @param options - Additional query options
 * @returns Structured query ready for execution
 * @example
 * ```typescript
 * const structured = buildStructuredQuery(parsed);
 * // Returns query with filters, sorting, and limits
 * ```
 */
export function buildStructuredQuery(
  parsed: ParsedQuery,
  config: NLQConfig = DEFAULT_NLQ_CONFIG,
  options: {
    limit?: number;
    offset?: number;
    includeExpired?: boolean;
    minConfidence?: number;
  } = {},
): StructuredQuery {
  const filters: import("../types").FilterCondition[] = [];
  const entities = parsed.entities;

  // Build FTS5 text query from remaining tokens
  const textQuery = buildTextQuery(parsed, config);

  // Extract categories
  const categoryEntities = getTopEntities(entities, "category");
  const categories = categoryEntities.map((e) => e.value as string);

  // Extract domains
  const domainEntities = getTopEntities(entities, "domain");
  const domains = domainEntities.map((e) => e.value as string);

  // Extract reward types
  const rewardTypeEntities = getTopEntities(entities, "reward_type");
  const rewardTypes = rewardTypeEntities.map((e) => e.value as RewardType);

  // Extract reward value constraints
  const rewardValueEntities = getTopEntities(entities, "reward_value");
  let minRewardValue: number | undefined;
  let maxRewardValue: number | undefined;

  for (const entity of rewardValueEntities) {
    const value = entity.value as number;
    const operator = entity.operator || "gte";

    switch (operator) {
      case "gte":
      case "gt":
        minRewardValue = value;
        filters.push({
          field: "reward_value",
          operator,
          value,
        });
        break;
      case "lte":
      case "lt":
        maxRewardValue = value;
        filters.push({
          field: "reward_value",
          operator,
          value,
        });
        break;
      case "eq":
        minRewardValue = value;
        maxRewardValue = value;
        filters.push({
          field: "reward_value",
          operator: "eq",
          value,
        });
        break;
    }
  }

  // Extract status
  const statusEntities = getTopEntities(entities, "status");
  const status =
    statusEntities.length > 0
      ? (statusEntities[0].value as "active" | "quarantined" | "rejected")
      : "active";

  // Extract date constraints (expiry)
  const dateEntities = getTopEntities(entities, "date");
  for (const entity of dateEntities) {
    if (entity.type === "date") {
      filters.push({
        field: "expiry_days",
        operator: entity.operator || "lte",
        value: entity.value as number,
      });
    }
  }

  // Determine sort order based on intent and entities
  let sortBy: import("../types").SortField = "relevance";
  let sortOrder: import("../types").SortOrder = "desc";

  // Check for explicit ranking criteria
  const rankingCriteria = extractRankingCriteria(parsed.cleanedText);
  if (rankingCriteria) {
    sortBy = rankingCriteria;
  }

  // Check if it's a comparison or ranking query
  if (isRankingQuery(parsed.cleanedText)) {
    // If ranking by reward value
    if (
      /\b(highest|best|most)\s+(bonus|reward|payout)\b/i.test(
        parsed.cleanedText,
      )
    ) {
      sortBy = "reward_value";
      sortOrder = "desc";
    }
    // If ranking by confidence
    else if (
      /\bmost\s+trusted|highest\s+confidence\b/i.test(parsed.cleanedText)
    ) {
      sortBy = "confidence_score";
      sortOrder = "desc";
    }
  }

  // If comparing, sort by reward value for easier comparison
  if (parsed.intent.intent === "compare" && sortBy === "relevance") {
    sortBy = "reward_value";
    sortOrder = "desc";
  }

  return {
    textQuery,
    filters,
    categories: categories.length > 0 ? categories : undefined,
    domains: domains.length > 0 ? domains : undefined,
    rewardTypes: rewardTypes.length > 0 ? rewardTypes : undefined,
    minRewardValue,
    maxRewardValue,
    status: status as "active" | "quarantined" | "rejected" | "all",
    includeExpired: options.includeExpired || false,
    sortBy,
    sortOrder,
    limit: options.limit || config.defaultLimit,
    offset: options.offset || 0,
  };
}

/**
 * Build FTS5-compatible text query from parsed tokens.
 *
 * Removes stopwords and structures tokens for FTS5 MATCH.
 *
 * @param parsed - Parsed query
 * @param config - NLQ configuration
 * @returns FTS5 query string or undefined if no meaningful text
 */
function buildTextQuery(
  parsed: ParsedQuery,
  config: NLQConfig,
): string | undefined {
  const contentTokens: Token[] = parsed.tokens.filter(
    (t: Token) =>
      t.type === "word" &&
      !config.stopwords.has(t.normalized) &&
      t.normalized.length >= config.minTokenLength,
  );

  if (contentTokens.length === 0) {
    return undefined;
  }

  // Join with OR for broader matching, can be tuned to AND for stricter matching
  const words = contentTokens.map((t) => t.normalized);

  // Remove duplicate words
  const uniqueWords = Array.from(new Set(words));

  // For single word, return as-is
  if (uniqueWords.length === 1) {
    return uniqueWords[0];
  }

  // For multiple words, use OR for broader results
  return uniqueWords.join(" OR ");
}
