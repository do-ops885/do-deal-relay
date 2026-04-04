/**
 * NLQ Service Functions
 *
 * Programmatic NLQ execution for MCP tools and internal use.
 */

import type { Env } from "../../types";
import { parseQuery } from "../../lib/nlq/parser";
import {
  buildStructuredQuery,
  executeStructuredQuery,
} from "../../lib/nlq/query-builder";

/**
 * Execute a natural language query programmatically.
 * Used by MCP tools for AI-powered query processing.
 */
export async function executeNLQ(
  env: Env,
  query: string,
  limit?: number,
): Promise<{
  success: boolean;
  query: string;
  parsed: {
    type: string;
    entities: Array<{ type: string; value: string; confidence: number }>;
    intent: { primary: string; confidence: number };
  };
  count: number;
  results: unknown[];
  suggestions?: string[];
  sql?: string;
}> {
  if (!env.DEALS_DB) {
    return {
      success: false,
      query,
      parsed: {
        type: "error",
        entities: [],
        intent: { primary: "error", confidence: 0 },
      },
      count: 0,
      results: [],
    };
  }

  try {
    // Parse the query
    const parsed = parseQuery(query);

    // Build structured query
    const structured = buildStructuredQuery(parsed, undefined, {
      limit: limit ?? 20,
      offset: 0,
      includeExpired: false,
    });

    // Execute query
    const results = await executeStructuredQuery(env.DEALS_DB, structured);

    return {
      success: true,
      query,
      parsed: {
        type: parsed.intent.intent,
        entities: parsed.entities.map((e) => ({
          type: e.type,
          value: String(e.value),
          confidence: e.confidence,
        })),
        intent: {
          primary: parsed.intent.intent,
          confidence: parsed.intent.confidence,
        },
      },
      count: results.length,
      results,
      suggestions:
        results.length === 0
          ? ["Try broader terms", "Check spelling", "Use simpler keywords"]
          : undefined,
      sql: undefined, // Could add SQL generation if needed
    };
  } catch (error) {
    return {
      success: false,
      query,
      parsed: {
        type: "error",
        entities: [],
        intent: { primary: "error", confidence: 0 },
      },
      count: 0,
      results: [],
    };
  }
}

/**
 * Parse a natural language query without executing.
 * Used by MCP tools for query analysis.
 */
export function parseNaturalLanguageQuery(query: string): {
  tokens: { value: string; type: string; normalized: string }[];
  intent: { intent: string; confidence: number; keywords: string[] };
  entities: { type: string; value: string | number; confidence: number }[];
} {
  const parsed = parseQuery(query);

  return {
    tokens: parsed.tokens.map((t) => ({
      value: t.value,
      type: t.type,
      normalized: t.normalized,
    })),
    intent: parsed.intent,
    entities: parsed.entities,
  };
}
