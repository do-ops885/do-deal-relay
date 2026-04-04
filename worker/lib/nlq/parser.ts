/**
 * NLQ Query Parser
 *
 * Tokenizes natural language queries and extracts entities
 * for structured query building.
 */

import {
  Token,
  ParsedQuery,
  ExtractedEntity,
  NLQConfig,
  DEFAULT_NLQ_CONFIG,
} from "./types";
import { classifyIntent } from "./intent";
import type { IntentClassification } from "./types";
import { tokenize, removeStopwords } from "./lexer";
import { extractEntities, getTopEntities } from "./entities";

export { tokenize, removeStopwords } from "./lexer";
export { extractEntities, getTopEntities } from "./entities";

/**
 * Parse a natural language query into a structured representation.
 *
 * This is the main entry point for query parsing. It tokenizes the input,
 * classifies intent, and extracts entities.
 *
 * @param query - Raw natural language query
 * @param config - NLQ configuration
 * @returns Parsed query with tokens, entities, and intent
 * @example
 * ```typescript
 * const parsed = parseQuery("trading platforms with $100+ signup bonus");
 * // Returns structured query with intent, tokens, and entities
 * ```
 */
export function parseQuery(
  query: string,
  config: NLQConfig = DEFAULT_NLQ_CONFIG,
): ParsedQuery {
  // Validate and clean input
  const cleanedText = query
    .trim()
    .slice(0, config.maxQueryLength)
    .replace(/[\r\n\t]/g, " ");

  // Tokenize
  const tokens = tokenize(cleanedText, config);

  // Classify intent
  const intent = classifyIntent(cleanedText, config);

  // Extract entities
  const entities = extractEntities(tokens, config);

  return {
    originalText: query,
    cleanedText,
    tokens,
    entities,
    intent,
  };
}

/**
 * Clean query text by removing unnecessary words and normalizing.
 *
 * @param query - Raw query
 * @param config - NLQ configuration
 * @returns Cleaned query suitable for FTS5 search
 */
export function cleanQueryForSearch(
  query: string,
  config: NLQConfig = DEFAULT_NLQ_CONFIG,
): string {
  const tokens = tokenize(query, config);

  // Keep only meaningful words and numbers
  const meaningful = tokens.filter(
    (t) =>
      (t.type === "word" && !config.stopwords.has(t.normalized)) ||
      t.type === "number" ||
      t.type === "currency",
  );

  return meaningful.map((t) => t.normalized).join(" ");
}
