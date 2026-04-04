// ============================================================================
// Hybrid Query Classifier - Rule-based Classification
// ============================================================================
// Rule-based classification for fast/simple query processing

import { logger } from "../../global-logger";
import { CONFIG } from "../../../config";
import type { Env } from "../../../types";
import type {
  EnhancedQuery,
  ExtractedIntent,
  QueryFilters,
} from "../ai-enhancer";

// Rule-based patterns for quick classification
export const INTENT_PATTERNS: Record<ExtractedIntent["primary"], RegExp[]> = {
  search: [
    /^\w+$/i, // Single word
    /find|look for|search/i,
    /^(?:get|need|want)\s+/i,
  ],
  compare: [
    /compare|versus|vs\.?/i,
    /(?:difference|better|worse)\s+(?:than|from)/i,
    /alternatives?\s+to/i,
    /similar\s+to/i,
  ],
  filter: [
    /only|just|filter|exclude|without/i,
    /with\s+(?:minimum|at least)/i,
    /(?:cash|credit|stock)\s+(?:only|reward)/i,
  ],
  rank: [
    /^(?:best|top|highest)/i,
    /ranked|rating|score/i,
    /(?:most|least)\s+(?:popular|trusted)/i,
    /(?:high|low)est\s+(?:rated|rated)/i,
  ],
  discover: [
    /^(?:what|show|list)/i,
    /(?:available|current|new)\s+deals?/i,
    /(?:browse|explore)/i,
    /^all\s+/i,
  ],
};

// Category detection patterns
export const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  crypto: [/crypto(?:currency)?|bitcoin|ethereum|btc|eth|blockchain/i],
  stock: [/stock|trading|broker|equity|shares/i],
  bank: [/bank|checking|savings|account/i],
  card: [/card|credit|debit|mastercard|visa/i],
  investment: [/invest|portfolio|retirement|ira|401k/i],
  fintech: [/fintech|finance|money|payment/i],
};

// Reward type patterns
export const REWARD_PATTERNS: Record<string, RegExp[]> = {
  cash: [
    /\$\d+|\d+\s*\$|\d+\s*(?:dollars?|bucks?|cash)/i,
    /cash\s+(?:bonus|reward)/i,
  ],
  credit: [/credit|points?|miles?/i],
  stock: [/stock|shares?/i, /free\s+stock/i],
  percent: [/%|\d+\s*(?:percent|%)/i, /(?:percentage|pct)/i],
};

// Sentiment patterns
export const SENTIMENT_PATTERNS = {
  positive: [/best|top|great|excellent|amazing|awesome|recommend/i],
  negative: [/scam|fraud|fake|terrible|worst|avoid|bad/i],
  neutral: [],
};

/**
 * Classify a query using rule-based patterns (fast path)
 */
export function classifyWithRules(
  query: string,
  startTime: number,
): EnhancedQuery {
  const normalized = normalizeQuery(query);

  // Detect intent
  const intent = detectIntent(normalized);

  // Extract entities
  const entities = extractEntitiesWithRules(normalized);

  // Build expansions
  const expansion = buildExpansions(normalized, entities);

  // Build filters
  const filters = buildFiltersFromEntities(entities);

  // Calculate confidence
  const confidence = calculateRuleConfidence(entities, intent);

  return {
    original: query,
    normalized,
    entities,
    intent,
    expansion,
    filters,
    aiConfidence: confidence,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Normalize a query string for processing
 */
export function normalizeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .slice(0, CONFIG.NLQ_MAX_QUERY_LENGTH)
    .replace(/\s+/g, " ");
}

/**
 * Detect intent from normalized query using patterns
 */
export function detectIntent(query: string): ExtractedIntent {
  const scores: Record<ExtractedIntent["primary"], number> = {
    search: 0,
    compare: 0,
    filter: 0,
    rank: 0,
    discover: 0,
  };

  // Score each intent type
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        scores[intent as ExtractedIntent["primary"]] += 1;
      }
    }
  }

  // Find highest scoring intent
  let bestIntent: ExtractedIntent["primary"] = "search";
  let bestScore = 0;

  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent as ExtractedIntent["primary"];
    }
  }

  // Calculate confidence based on score
  const confidence = Math.min(0.5 + bestScore * 0.2, 0.9);

  return { primary: bestIntent, confidence };
}

/**
 * Extract entities using rule-based patterns
 */
export function extractEntitiesWithRules(
  query: string,
): EnhancedQuery["entities"] {
  const entities: EnhancedQuery["entities"] = [];

  // Categories
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        entities.push({
          type: "category",
          value: category,
          confidence: 0.8,
        });
        break;
      }
    }
  }

  // Reward types
  for (const [reward, patterns] of Object.entries(REWARD_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        entities.push({
          type: "reward_type",
          value: reward,
          confidence: 0.75,
        });
        break;
      }
    }
  }

  // Sentiment
  for (const [sentiment, patterns] of Object.entries(SENTIMENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        entities.push({
          type: "sentiment",
          value: sentiment,
          confidence: 0.7,
          metadata: {
            impact:
              sentiment === "positive"
                ? 0.3
                : sentiment === "negative"
                  ? -0.5
                  : 0,
          },
        });
        break;
      }
    }
  }

  // Domains (simple heuristic)
  const domainPattern = /\b([a-z]+\.com?|app\.[a-z]+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = domainPattern.exec(query)) !== null) {
    entities.push({
      type: "domain",
      value: match[1],
      confidence: 0.85,
    });
  }

  return entities;
}

/**
 * Build query expansions from entities
 */
export function buildExpansions(
  query: string,
  entities: EnhancedQuery["entities"],
): EnhancedQuery["expansion"] {
  const expanded: string[] = [];
  const synonyms = new Map<string, string[]>();

  // Add category synonyms
  const categoryEntity = entities.find((e) => e.type === "category");
  if (categoryEntity) {
    const categorySynonyms: Record<string, string[]> = {
      crypto: ["cryptocurrency", "digital assets", "crypto exchange"],
      stock: ["stock trading", "equity", "shares"],
      bank: ["neobank", "digital bank", "checking account"],
      card: ["credit card", "debit card", "payment card"],
      investment: ["investing", "portfolio", "wealth management"],
      fintech: ["financial app", "money app", "finance tool"],
    };

    const syns = categorySynonyms[categoryEntity.value];
    if (syns) {
      synonyms.set(categoryEntity.value, syns);
      for (const syn of syns) {
        expanded.push(query.replace(categoryEntity.value, syn));
      }
    }
  }

  return {
    original: query,
    expanded,
    synonyms,
  };
}

/**
 * Build filters from extracted entities
 */
export function buildFiltersFromEntities(
  entities: EnhancedQuery["entities"],
): QueryFilters {
  const filters: QueryFilters = {};

  for (const entity of entities) {
    switch (entity.type) {
      case "category":
        filters.categories = [...(filters.categories || []), entity.value];
        break;
      case "reward_type":
        filters.rewardTypes = [...(filters.rewardTypes || []), entity.value];
        break;
      case "domain":
        filters.domains = [...(filters.domains || []), entity.value];
        break;
      case "sentiment": {
        const impact = entity.metadata?.impact as number;
        if (impact > 0) {
          filters.minTrustScore = 0.8;
          filters.minRanking = 0.8;
        } else if (impact < 0) {
          filters.sentimentFilter = "negative";
          filters.minTrustScore = 0.3;
        }
        break;
      }
    }
  }

  return filters;
}

/**
 * Calculate confidence score from entities and intent
 */
export function calculateRuleConfidence(
  entities: EnhancedQuery["entities"],
  intent: ExtractedIntent,
): number {
  // Base confidence from intent
  let confidence = intent.confidence * 0.6;

  // Add confidence from entities
  if (entities.length > 0) {
    const avgEntityConfidence =
      entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length;
    confidence += avgEntityConfidence * 0.3;
  }

  // Boost for clear patterns
  if (intent.primary !== "search") {
    confidence += 0.1;
  }

  return Math.min(confidence, 0.95);
}
