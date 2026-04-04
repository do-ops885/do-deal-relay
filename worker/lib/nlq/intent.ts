/**
 * NLQ Intent Classifier
 *
 * Rule-based intent classification for natural language queries.
 * Uses keyword matching with confidence scoring to identify user intent.
 */

import {
  NLQIntent,
  IntentClassification,
  NLQConfig,
  DEFAULT_NLQ_CONFIG,
} from "./types";

// ============================================================================
// Intent Classification
// ============================================================================

/**
 * Classify the intent of a natural language query.
 *
 * Uses keyword matching against predefined patterns for each intent type.
 * Returns the intent with highest confidence score.
 *
 * @param query - The normalized query text
 * @param config - NLQ configuration with intent keywords
 * @returns Intent classification with confidence score
 * @example
 * ```typescript
 * const result = classifyIntent("find trading platforms with cash bonus");
 * // { intent: "search", confidence: 0.9, keywords: ["find"], originalQuery: "..." }
 * ```
 */
export function classifyIntent(
  query: string,
  config: NLQConfig = DEFAULT_NLQ_CONFIG,
): IntentClassification {
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/);

  const scores: Record<NLQIntent, { score: number; matches: string[] }> = {
    search: { score: 0, matches: [] },
    compare: { score: 0, matches: [] },
    filter: { score: 0, matches: [] },
    rank: { score: 0, matches: [] },
    suggest: { score: 0, matches: [] },
    count: { score: 0, matches: [] },
    unknown: { score: 0, matches: [] },
  };

  // Score each intent based on keyword matches
  for (const [intent, keywords] of Object.entries(config.intentKeywords)) {
    for (const keyword of keywords) {
      // Check for exact phrase match (higher weight)
      if (keyword.includes(" ") && lowerQuery.includes(keyword)) {
        scores[intent as NLQIntent].score += 2;
        scores[intent as NLQIntent].matches.push(keyword);
      }
      // Check for word match
      else if (words.includes(keyword)) {
        scores[intent as NLQIntent].score += 1;
        scores[intent as NLQIntent].matches.push(keyword);
      }
    }
  }

  // Special patterns for specific intents

  // Compare patterns
  if (/\b(compare|vs|versus)\b/i.test(query)) {
    scores.compare.score += 3;
    scores.compare.matches.push("compare/vs pattern");
  }

  // Count patterns
  if (/\b(how many|count of|number of|total)\b/i.test(query)) {
    scores.count.score += 3;
    scores.count.matches.push("count pattern");
  }

  // Rank patterns
  if (/\b(top|best|highest|lowest|ranked?|sorted?)\b/i.test(query)) {
    scores.rank.score += 3;
    scores.rank.matches.push("ranking pattern");
  }

  // Find the highest scoring intent
  let bestIntent: NLQIntent = "unknown";
  let bestScore = 0;

  for (const [intent, data] of Object.entries(scores)) {
    if (data.score > bestScore) {
      bestScore = data.score;
      bestIntent = intent as NLQIntent;
    }
  }

  // Calculate confidence (normalize by max possible score ~10)
  const maxPossibleScore = 10;
  const confidence = Math.min(bestScore / maxPossibleScore, 0.95);

  // If no clear winner, fallback to search
  if (bestScore === 0) {
    return {
      intent: "search",
      confidence: 0.5,
      keywords: [],
      originalQuery: query,
    };
  }

  return {
    intent: bestIntent,
    confidence,
    keywords: scores[bestIntent].matches,
    originalQuery: query,
  };
}

/**
 * Get secondary intents that might apply to the query.
 *
 * Useful for queries with multiple intentions (e.g., "find and compare").
 *
 * @param query - The normalized query text
 * @param primaryIntent - The primary intent already identified
 * @param config - NLQ configuration
 * @returns Array of secondary intents with confidence
 */
export function getSecondaryIntents(
  query: string,
  primaryIntent: NLQIntent,
  config: NLQConfig = DEFAULT_NLQ_CONFIG,
): Array<{ intent: NLQIntent; confidence: number }> {
  const allIntents = classifyAllIntents(query, config);

  return allIntents
    .filter((i) => i.intent !== primaryIntent && i.confidence > 0.3)
    .slice(0, 2); // Return top 2 secondary intents
}

/**
 * Classify all possible intents with their scores.
 *
 * @param query - The normalized query text
 * @param config - NLQ configuration
 * @returns Array of all intents sorted by confidence
 */
function classifyAllIntents(
  query: string,
  config: NLQConfig,
): Array<{ intent: NLQIntent; confidence: number }> {
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/);

  const scores: Record<NLQIntent, number> = {
    search: 0,
    compare: 0,
    filter: 0,
    rank: 0,
    suggest: 0,
    count: 0,
    unknown: 0,
  };

  // Score each intent
  for (const [intent, keywords] of Object.entries(config.intentKeywords)) {
    for (const keyword of keywords) {
      if (keyword.includes(" ") && lowerQuery.includes(keyword)) {
        scores[intent as NLQIntent] += 2;
      } else if (words.includes(keyword)) {
        scores[intent as NLQIntent] += 1;
      }
    }
  }

  // Special patterns
  if (/\b(compare|vs|versus)\b/i.test(query)) scores.compare += 3;
  if (/\b(how many|count of|number of)\b/i.test(query)) scores.count += 3;
  if (/\b(top|best|highest|lowest)\b/i.test(query)) scores.rank += 3;

  // Convert to array and sort
  return Object.entries(scores)
    .map(([intent, score]) => ({
      intent: intent as NLQIntent,
      confidence: Math.min(score / 10, 0.95),
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Check if a query has comparison intent.
 *
 * @param query - The query text
 * @returns True if query appears to be a comparison
 */
export function isComparisonQuery(query: string): boolean {
  const comparisonPatterns = [
    /\bcompare\b/i,
    /\bversus\b/i,
    /\bvs\b/i,
    /\bdifference between\b/i,
    /\b(better|best|worse|worst) than\b/i,
    /\bvs\.\b/i,
  ];

  return comparisonPatterns.some((pattern) => pattern.test(query));
}

/**
 * Check if a query has ranking/sorting intent.
 *
 * @param query - The query text
 * @returns True if query appears to request ranking
 */
export function isRankingQuery(query: string): boolean {
  const rankingPatterns = [
    /\btop\s+\d+/i,
    /\bbest\b/i,
    /\bhighest\b/i,
    /\blowest\b/i,
    /\brank\w*\s+by\b/i,
    /\bsort\w*\s+by\b/i,
    /\border\s+by\b/i,
    /\bmost\s+\w+\b/i,
    /\bleast\s+\w+\b/i,
  ];

  return rankingPatterns.some((pattern) => pattern.test(query));
}

/**
 * Extract the ranking/sorting criteria from a query.
 *
 * @param query - The query text
 * @returns The detected sort field or undefined
 */
export function extractRankingCriteria(
  query: string,
): "reward_value" | "confidence_score" | "relevance" | undefined {
  const lowerQuery = query.toLowerCase();

  // Reward value ranking
  if (
    /\b(highest|lowest|best|most)\s+(bonus|reward|payout|value|cash)\b/i.test(
      query,
    )
  ) {
    return "reward_value";
  }

  // Confidence/trust ranking
  if (/\b(most\s+trusted|highest\s+confidence|best\s+rated)\b/i.test(query)) {
    return "confidence_score";
  }

  // Relevance ranking (default for most searches)
  if (/\bmost\s+relevant|best\s+match|popular\b/i.test(query)) {
    return "relevance";
  }

  return undefined;
}
