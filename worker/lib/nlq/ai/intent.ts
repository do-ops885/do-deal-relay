// ============================================================================
// AI-Powered Intent Classification
// ============================================================================
// Uses Workers AI to classify query intent

import { logger } from "../../global-logger";
import { CONFIG } from "../../../config";
import type { ExtractedIntent } from "./types";

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const AI_MAX_TOKENS_SHORT = CONFIG.NLQ_AI_MAX_TOKENS_SHORT;
type AiRunFn = (model: string, inputs: unknown) => Promise<unknown>;

/**
 * Classify query intent using AI
 */
export async function classifyIntent(
  ai: Ai,
  query: string,
): Promise<ExtractedIntent> {
  const prompt = `Classify the search intent of this query: "${query}"

Options: search, compare, filter, rank, discover

Return ONLY the intent name and confidence (0-1) as JSON:
{"intent": "intent_name", "confidence": 0.85}

Respond with only valid JSON.`;

  try {
    const result = await (ai.run as AiRunFn)(AI_MODEL, {
      prompt,
      max_tokens: AI_MAX_TOKENS_SHORT,
      temperature: 0.1,
    });

    const response = result as { response: string };
    const parsed = JSON.parse(response.response.trim());

    return {
      primary: validateIntent(parsed.intent),
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
    };
  } catch (error) {
    logger.warn("AI intent classification failed", {
      error: (error as Error).message,
    });
    return { primary: "search", confidence: 0.5 };
  }
}

/**
 * Validate intent string against valid options
 */
export function validateIntent(intent: string): ExtractedIntent["primary"] {
  const valid = ["search", "compare", "filter", "rank", "discover"] as const;
  return valid.includes(intent as ExtractedIntent["primary"])
    ? (intent as ExtractedIntent["primary"])
    : "search";
}
