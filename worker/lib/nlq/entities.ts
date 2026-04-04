/**
 * NLQ Entity Extraction
 *
 * Extracts entities from tokenized queries including categories,
 * domains, reward types, amounts, and other structured information.
 */

import {
  Token,
  ExtractedEntity,
  ComparisonOperator,
  NLQConfig,
  DEFAULT_NLQ_CONFIG,
} from "./types";
import { removeStopwords } from "./lexer";

/**
 * Extract entities from tokenized query.
 *
 * Identifies categories, domains, reward types, amounts, and other
 * structured information from the query tokens.
 *
 * @param tokens - Tokenized query
 * @param config - NLQ configuration
 * @returns Array of extracted entities
 */
export function extractEntities(
  tokens: Token[],
  config: NLQConfig = DEFAULT_NLQ_CONFIG,
): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const contentTokens = removeStopwords(tokens, config);

  // Extract categories
  const categoryEntities = extractCategories(contentTokens, config);
  entities.push(...categoryEntities);

  // Extract reward types and values
  const rewardEntities = extractRewards(contentTokens, config);
  entities.push(...rewardEntities);

  // Extract domains
  const domainEntities = extractDomains(contentTokens);
  entities.push(...domainEntities);

  // Extract status filters
  const statusEntities = extractStatus(contentTokens);
  entities.push(...statusEntities);

  // Extract date/time references
  const dateEntities = extractDates(contentTokens);
  entities.push(...dateEntities);

  return entities;
}

/**
 * Extract category entities from tokens.
 */
function extractCategories(
  tokens: Token[],
  config: NLQConfig,
): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const tokenValues = tokens.map((t) => t.normalized);

  for (const [category, synonyms] of Object.entries(config.categoryMappings)) {
    for (const synonym of synonyms) {
      // Check for exact match
      if (tokenValues.includes(synonym)) {
        entities.push({
          type: "category",
          value: category,
          confidence: 0.9,
        });
      }
      // Check for partial match (e.g., "trading" matches "trading platforms")
      else {
        for (const token of tokens) {
          if (
            token.normalized.includes(synonym) ||
            synonym.includes(token.normalized)
          ) {
            // Avoid duplicates
            const exists = entities.some(
              (e) => e.type === "category" && e.value === category,
            );
            if (!exists) {
              entities.push({
                type: "category",
                value: category,
                confidence: 0.7,
              });
            }
          }
        }
      }
    }
  }

  return entities;
}

/**
 * Extract reward type and value entities from tokens.
 */
function extractRewards(tokens: Token[], config: NLQConfig): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Look for currency symbols followed by numbers
    if (token.type === "currency" && i + 1 < tokens.length) {
      const nextToken = tokens[i + 1];
      if (nextToken.type === "number") {
        let value = parseFloat(nextToken.value);
        let operator: ComparisonOperator = "gte";

        // Check for + operator indicating "or more"
        if (i + 2 < tokens.length && tokens[i + 2].value === "+") {
          operator = "gte";
        }
        // Check for range pattern (e.g., "$50-$100")
        else if (
          i + 3 < tokens.length &&
          tokens[i + 2].value === "-" &&
          tokens[i + 3].type === "number"
        ) {
          value = parseFloat(tokens[i + 3].value);
          operator = "lte";
        }

        entities.push({
          type: "reward_value",
          value,
          operator,
          confidence: 0.9,
        });

        // Infer reward type from currency
        entities.push({
          type: "reward_type",
          value: "cash",
          confidence: 0.8,
        });
      }
    }

    // Look for number followed by reward keywords
    if (token.type === "number") {
      const value = parseFloat(token.value);

      // Look ahead for reward keywords
      for (let j = i + 1; j < Math.min(i + 3, tokens.length); j++) {
        const nextToken = tokens[j];
        if (
          nextToken.normalized.includes("bonus") ||
          nextToken.normalized.includes("reward") ||
          nextToken.normalized.includes("credit") ||
          nextToken.normalized.includes("point")
        ) {
          entities.push({
            type: "reward_value",
            value,
            operator: "gte",
            confidence: 0.85,
          });
          break;
        }
      }
    }

    // Look for reward type keywords
    for (const [rewardType, keywords] of Object.entries(
      config.rewardTypeMappings,
    )) {
      if (keywords.includes(token.normalized)) {
        const exists = entities.some(
          (e) => e.type === "reward_type" && e.value === rewardType,
        );
        if (!exists) {
          entities.push({
            type: "reward_type",
            value: rewardType,
            confidence: 0.85,
          });
        }
      }
    }

    // Look for percent patterns
    if (
      token.value === "%" ||
      token.normalized === "percent" ||
      token.normalized === "percentage"
    ) {
      // Check preceding number
      if (i > 0 && tokens[i - 1].type === "number") {
        entities.push({
          type: "reward_type",
          value: "percent",
          confidence: 0.9,
        });
      }
    }
  }

  return entities;
}

/**
 * Extract domain entities from tokens.
 */
function extractDomains(tokens: Token[]): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const domainPatterns = [
    /^(?:https?:\/\/)?(?:www\.)?([\w-]+\.(?:com|io|co|net|org|app|dev|ai|tech))\b/i,
    /\b(robinhood|webull|etrade|schwab|fidelity|coinbase|binance|kraken|gemini)\b/i,
  ];

  for (const token of tokens) {
    // Check for explicit domain patterns
    for (const pattern of domainPatterns) {
      const match = token.value.match(pattern);
      if (match) {
        const domain = match[1] || match[0];
        entities.push({
          type: "domain",
          value: domain.toLowerCase(),
          confidence: 0.9,
        });
      }
    }

    // Check for platform names that might be domains
    const platformNames = [
      "robinhood",
      "webull",
      "etrade",
      "schwab",
      "fidelity",
      "coinbase",
      "binance",
      "kraken",
      "gemini",
      "kucoin",
      "tradestation",
      "td",
      "ameritrade",
      "interactive",
      "brokers",
      "alpaca",
      "sofi",
      "acorns",
      "stash",
    ];

    if (platformNames.includes(token.normalized)) {
      // Avoid duplicates
      const exists = entities.some(
        (e) => e.type === "domain" && e.value === token.normalized,
      );
      if (!exists) {
        entities.push({
          type: "domain",
          value: token.normalized,
          confidence: 0.7,
        });
      }
    }
  }

  return entities;
}

/**
 * Extract status filter entities from tokens.
 */
function extractStatus(tokens: Token[]): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const statusPatterns: Array<[RegExp, string]> = [
    [/\bactive\b/i, "active"],
    [/\bexpired?\b/i, "expired"],
    [/\bquarantine[\w]*\b/i, "quarantined"],
    [/\breject[\w]*\b/i, "rejected"],
  ];

  for (const token of tokens) {
    for (const [pattern, status] of statusPatterns) {
      if (pattern.test(token.value)) {
        entities.push({
          type: "status",
          value: status,
          confidence: 0.8,
        });
      }
    }
  }

  return entities;
}

/**
 * Extract date/time entities from tokens.
 */
function extractDates(tokens: Token[]): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  // Look for "expiring in X days/weeks/months" patterns
  const expiringPattern =
    /\b(expir(?:e|ing|es)|ending)\s+(?:in\s+)?(\d+)\s+(day|days|week|weeks|month|months)\b/i;
  const text = tokens.map((t) => t.value).join(" ");

  const match = text.match(expiringPattern);
  if (match) {
    const amount = parseInt(match[2], 10);
    const unit = match[3].toLowerCase();
    let days = amount;

    if (unit.startsWith("week")) days = amount * 7;
    if (unit.startsWith("month")) days = amount * 30;

    entities.push({
      type: "date",
      value: days,
      operator: "lte",
      confidence: 0.85,
    });
  }

  // Look for "new" or "recent" patterns
  const recentPattern = /\b(new|recent|latest|just added)\b/i;
  if (recentPattern.test(text)) {
    entities.push({
      type: "date",
      value: 7, // Last 7 days
      operator: "gte",
      confidence: 0.7,
    });
  }

  return entities;
}

/**
 * Get the most confident entities of a specific type.
 *
 * @param entities - All extracted entities
 * @param type - Entity type to filter by
 * @param minConfidence - Minimum confidence threshold
 * @returns Filtered and sorted entities
 */
export function getTopEntities(
  entities: ExtractedEntity[],
  type: ExtractedEntity["type"],
  minConfidence = 0.5,
): ExtractedEntity[] {
  return entities
    .filter((e) => e.type === type && e.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}
