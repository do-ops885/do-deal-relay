/**
 * NLQ (Natural Language Query) Type Definitions
 *
 * Type-safe schemas and interfaces for parsing natural language
 * queries into structured database queries.
 */

import { z } from "zod";
import { CONFIG } from "../../config";

// ============================================================================
// Intent Classification Types
// ============================================================================

export const NLQIntentSchema = z.enum([
  "search", // General search for deals
  "compare", // Compare multiple deals/platforms
  "filter", // Filter by specific criteria
  "rank", // Rank/sort deals by criteria
  "suggest", // Get suggestions/recommendations
  "count", // Get count/statistics
  "unknown", // Fallback
]);

export type NLQIntent = z.infer<typeof NLQIntentSchema>;

export interface IntentClassification {
  intent: NLQIntent;
  confidence: number;
  keywords: string[];
  originalQuery: string;
}

// ============================================================================
// Entity Extraction Types
// ============================================================================

export const RewardTypeSchema = z.enum(["cash", "credit", "percent", "item"]);
export type RewardType = z.infer<typeof RewardTypeSchema>;

export const ComparisonOperatorSchema = z.enum([
  "gt", // greater than
  "gte", // greater than or equal
  "lt", // less than
  "lte", // less than or equal
  "eq", // equal
  "neq", // not equal
  "like", // SQL LIKE pattern
]);
export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>;

export interface ExtractedEntity {
  type:
    | "category"
    | "domain"
    | "reward_type"
    | "reward_value"
    | "status"
    | "date"
    | "text";
  value: string | number;
  operator?: ComparisonOperator;
  confidence: number;
}

export interface ParsedQuery {
  originalText: string;
  tokens: Token[];
  entities: ExtractedEntity[];
  intent: IntentClassification;
  cleanedText: string;
}

// ============================================================================
// Structured Query Types
// ============================================================================

export const SortOrderSchema = z.enum(["asc", "desc"]);
export type SortOrder = z.infer<typeof SortOrderSchema>;

export const SortFieldSchema = z.enum([
  "confidence_score",
  "reward_value",
  "created_at",
  "expiry_date",
  "relevance",
  "title",
]);
export type SortField = z.infer<typeof SortFieldSchema>;

export interface FilterCondition {
  field: string;
  operator: ComparisonOperator;
  value: string | number | boolean;
}

export interface StructuredQuery {
  textQuery?: string; // FTS5 search text
  filters: FilterCondition[];
  categories?: string[];
  domains?: string[];
  rewardTypes?: RewardType[];
  minRewardValue?: number;
  maxRewardValue?: number;
  status?: "active" | "quarantined" | "rejected" | "all";
  includeExpired: boolean;
  sortBy: SortField;
  sortOrder: SortOrder;
  limit: number;
  offset: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export const NLQRequestSchema = z.object({
  query: z.string().min(1).max(CONFIG.NLQ_MAX_QUERY_LENGTH),
  limit: z
    .number()
    .int()
    .min(1)
    .max(CONFIG.NLQ_MAX_LIMIT)
    .optional()
    .default(CONFIG.NLQ_DEFAULT_LIMIT),
  offset: z.number().int().min(0).optional().default(0),
  include_expired: z.boolean().optional().default(false),
  min_confidence: z.number().min(0).max(1).optional(),
});

export type NLQRequest = z.infer<typeof NLQRequestSchema>;

export interface NLQExplanation {
  intent: NLQIntent;
  intent_confidence: number;
  entities_found: number;
  filters_applied: string[];
  search_text?: string;
  sort_applied: {
    field: SortField;
    order: SortOrder;
  };
}

export interface NLQResult {
  success: boolean;
  query: string;
  explanation: NLQExplanation;
  count: number;
  total_available?: number;
  results: unknown[];
  execution_time_ms: number;
  suggestions?: string[];
}

export interface NLQError {
  error: string;
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Token Types
// ============================================================================

export interface Token {
  value: string;
  type:
    | "word"
    | "number"
    | "currency"
    | "operator"
    | "punctuation"
    | "stopword";
  position: number;
  normalized: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface NLQConfig {
  maxQueryLength: number;
  defaultLimit: number;
  maxLimit: number;
  minTokenLength: number;
  stopwords: Set<string>;
  categoryMappings: Record<string, string[]>;
  rewardTypeMappings: Record<RewardType, string[]>;
  intentKeywords: Record<NLQIntent, string[]>;
  currencySymbols: Record<string, string>;
}

// Default configuration
export const DEFAULT_NLQ_CONFIG: NLQConfig = {
  maxQueryLength: CONFIG.NLQ_MAX_QUERY_LENGTH,
  defaultLimit: CONFIG.NLQ_DEFAULT_LIMIT,
  maxLimit: CONFIG.NLQ_MAX_LIMIT,
  minTokenLength: 2,
  stopwords: new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "can",
    "shall",
    "need",
    "dare",
    "ought",
    "used",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "and",
    "but",
    "if",
    "or",
    "because",
    "until",
    "while",
  ]),
  categoryMappings: {
    trading: ["trading", "brokerage", "stocks", "crypto", "forex"],
    banking: ["banking", "bank", "savings", "checking", "account"],
    investment: [
      "investment",
      "investing",
      "portfolio",
      "retirement",
      "401k",
      "ira",
    ],
    crypto: ["crypto", "cryptocurrency", "bitcoin", "ethereum", "blockchain"],
    finance: ["finance", "financial", "fintech", "money"],
    shopping: ["shopping", "retail", "ecommerce", "store"],
    travel: ["travel", "flight", "hotel", "vacation", "booking"],
    food: ["food", "restaurant", "delivery", "meal"],
    subscription: ["subscription", "streaming", "service", "membership"],
    gaming: ["gaming", "game", "casino", "betting"],
  },
  rewardTypeMappings: {
    cash: ["cash", "money", "dollar", "usd", "eur", "gbp"],
    credit: ["credit", "credits", "points", "reward points"],
    percent: ["percent", "percentage", "%", "discount", "off"],
    item: ["item", "product", "free", "gift", "bonus"],
  },
  intentKeywords: {
    search: ["find", "search", "look", "get", "show", "list", "what", "where"],
    compare: ["compare", "versus", "vs", "difference", "better", "best"],
    filter: ["filter", "only", "with", "without", "except", "but"],
    rank: [
      "rank",
      "sort",
      "order",
      "top",
      "highest",
      "lowest",
      "most",
      "least",
    ],
    suggest: ["suggest", "recommend", "similar", "like", "alternative"],
    count: ["how many", "count", "number", "total", "statistics"],
    unknown: [],
  },
  currencySymbols: {
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "₹": "INR",
  },
};
