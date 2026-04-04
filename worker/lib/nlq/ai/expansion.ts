// ============================================================================
// AI-Powered Query Expansion
// ============================================================================
// Expands queries with synonyms and alternative phrasings

import { logger } from "../../global-logger";
import { CONFIG } from "../../../config";
import type { QueryExpansion } from "./types";

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
type AiRunFn = (model: string, inputs: unknown) => Promise<unknown>;

// Synonym expansion map
export const SYNONYM_MAP: Map<string, string[]> = new Map([
  ["broker", ["trading platform", "investment app", "stock app"]],
  ["crypto", ["cryptocurrency", "bitcoin", "ethereum", "digital assets"]],
  ["deal", ["offer", "promotion", "bonus", "reward", "referral"]],
  ["bank", ["neobank", "digital bank", "fintech", "financial app"]],
  ["card", ["credit card", "debit card", "payment card"]],
  ["invest", ["investment", "trading", "portfolio", "stocks"]],
]);

/**
 * Build query expansion with synonyms and AI alternatives
 */
export async function expandQuery(
  ai: Ai,
  query: string,
  shouldUseAI: boolean,
): Promise<QueryExpansion> {
  const expanded: string[] = [];
  const synonyms = new Map<string, string[]>();

  // Expand known synonyms
  for (const [term, expansions] of SYNONYM_MAP.entries()) {
    if (query.includes(term)) {
      synonyms.set(term, expansions);
      for (const exp of expansions) {
        expanded.push(query.replace(term, exp));
      }
    }
  }

  // AI-based expansion for complex queries
  if (shouldUseAI) {
    try {
      const aiExpansions = await expandWithAI(ai, query);
      expanded.push(...aiExpansions);
    } catch (error) {
      logger.debug("AI query expansion failed", {
        error: (error as Error).message,
      });
    }
  }

  return {
    original: query,
    expanded: [...new Set(expanded)],
    synonyms,
  };
}

/**
 * Expand query using AI
 */
async function expandWithAI(ai: Ai, query: string): Promise<string[]> {
  const prompt = `Expand this search query into alternative phrasings: "${query}"

Return ONLY a JSON array of strings:
["expanded phrase 1", "expanded phrase 2", "expanded phrase 3"]

Respond with only valid JSON.`;

  try {
    const result = await (ai.run as AiRunFn)(AI_MODEL, {
      prompt,
      max_tokens: 300,
      temperature: 0.3,
    });

    const response = result as { response: string };
    const parsed = JSON.parse(response.response.trim());

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.debug("AI expansion parsing failed", {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Create empty expansion for queries that don't need expansion
 */
export function createEmptyExpansion(query: string): QueryExpansion {
  return {
    original: query,
    expanded: [],
    synonyms: new Map(),
  };
}
