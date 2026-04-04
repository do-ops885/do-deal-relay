/**
 * NLQ Lexer - Tokenization
 *
 * Tokenizes natural language queries into typed tokens.
 * Handles currency symbols, numbers, and punctuation.
 */

import { Token, NLQConfig, DEFAULT_NLQ_CONFIG } from "./types";

/**
 * Tokenize a natural language query.
 *
 * Breaks the query into individual tokens with type classification.
 * Handles currency symbols, numbers, and punctuation.
 *
 * @param text - Raw query text
 * @param config - NLQ configuration
 * @returns Array of typed tokens
 * @example
 * ```typescript
 * const tokens = tokenize("trading platforms with $100+ bonus");
 * // [
 * //   { value: "trading", type: "word", position: 0, normalized: "trading" },
 * //   { value: "platforms", type: "word", position: 1, normalized: "platforms" },
 * //   { value: "with", type: "stopword", position: 2, normalized: "with" },
 * //   { value: "$", type: "currency", position: 3, normalized: "$" },
 * //   { value: "100", type: "number", position: 4, normalized: "100" },
 * //   { value: "+", type: "operator", position: 5, normalized: "+" },
 * //   { value: "bonus", type: "word", position: 6, normalized: "bonus" }
 * // ]
 * ```
 */
export function tokenize(
  text: string,
  config: NLQConfig = DEFAULT_NLQ_CONFIG,
): Token[] {
  const tokens: Token[] = [];
  const currencySymbols = Object.keys(config.currencySymbols);

  // Normalize the text
  const normalized = text
    .replace(/[\u201C\u201D]/g, '"') // Smart quotes to straight
    .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  // We'll manually split to better handle edge cases
  const rawTokens = normalized
    .split(/([\s,;:.!?()\[\]{}$€£¥₹]|[><=!]+|\d+\.?\d*)/g)
    .filter(Boolean);

  let position = 0;
  for (const rawToken of rawTokens) {
    const trimmed = rawToken.trim();
    if (!trimmed) continue;

    let type: Token["type"];
    let normalizedValue = trimmed.toLowerCase();

    // Classify token type
    if (currencySymbols.includes(trimmed)) {
      type = "currency";
    } else if (/^\d+\.?\d*$/.test(trimmed)) {
      type = "number";
    } else if (/^[><=!]+$/.test(trimmed) || /^[+-]$/.test(trimmed)) {
      type = "operator";
    } else if (config.stopwords.has(normalizedValue)) {
      type = "stopword";
    } else if (/^[\s,;:.!?()\[\]{}]$/.test(trimmed)) {
      type = "punctuation";
    } else {
      type = "word";
    }

    tokens.push({
      value: trimmed,
      type,
      position,
      normalized: normalizedValue,
    });

    position++;
  }

  return tokens;
}

/**
 * Remove stopwords from token list.
 *
 * @param tokens - Full token list
 * @param config - NLQ configuration
 * @returns Tokens with stopwords removed
 */
export function removeStopwords(
  tokens: Token[],
  config: NLQConfig = DEFAULT_NLQ_CONFIG,
): Token[] {
  return tokens.filter(
    (t) => t.type !== "stopword" && t.type !== "punctuation",
  );
}
