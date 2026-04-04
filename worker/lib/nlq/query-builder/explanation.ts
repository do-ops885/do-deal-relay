/**
 * NLQ Query Builder - Query Explanation
 *
 * Generates human-readable explanations of how queries are interpreted.
 */

import { ParsedQuery, StructuredQuery, SortField, SortOrder } from "../types";

/**
 * Get query explanation for debugging and transparency.
 *
 * @param parsed - Parsed query
 * @param structured - Structured query
 * @returns Human-readable explanation of how the query was interpreted
 */
export function explainQuery(
  parsed: ParsedQuery,
  structured: StructuredQuery,
): {
  intent: string;
  intent_confidence: number;
  entities_found: number;
  filters_applied: string[];
  search_text?: string;
  sort_applied: {
    field: SortField;
    order: SortOrder;
  };
} {
  const filters: string[] = [];

  if (structured.categories?.length) {
    filters.push(`Categories: ${structured.categories.join(", ")}`);
  }

  if (structured.domains?.length) {
    filters.push(`Domains: ${structured.domains.join(", ")}`);
  }

  if (structured.rewardTypes?.length) {
    filters.push(`Reward types: ${structured.rewardTypes.join(", ")}`);
  }

  if (structured.minRewardValue !== undefined) {
    filters.push(`Minimum reward: $${structured.minRewardValue}`);
  }

  if (structured.maxRewardValue !== undefined) {
    filters.push(`Maximum reward: $${structured.maxRewardValue}`);
  }

  if (structured.status && structured.status !== "all") {
    filters.push(`Status: ${structured.status}`);
  }

  if (!structured.includeExpired) {
    filters.push("Active deals only");
  }

  return {
    intent: parsed.intent.intent,
    intent_confidence: parsed.intent.confidence,
    entities_found: parsed.entities.length,
    filters_applied: filters,
    search_text: structured.textQuery,
    sort_applied: {
      field: structured.sortBy,
      order: structured.sortOrder,
    },
  };
}
