// ============================================================================
// AI-Powered Entity Extraction
// ============================================================================
// Uses Workers AI to extract entities from complex queries

import { logger } from "../../global-logger";
import { CONFIG } from "../../../config";
import type { Entity } from "./types";

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const AI_MAX_TOKENS_LONG = CONFIG.NLQ_AI_MAX_TOKENS_LONG;
type AiRunFn = (model: string, inputs: unknown) => Promise<unknown>;

// Sentiment keywords and their trust score impact
export const SENTIMENT_MAP: Record<string, { score: number; weight: number }> =
  {
    scam: { score: 0.1, weight: -0.5 },
    fraud: { score: 0.1, weight: -0.5 },
    fake: { score: 0.2, weight: -0.4 },
    suspicious: { score: 0.3, weight: -0.3 },
    best: { score: 0.9, weight: 0.3 },
    top: { score: 0.9, weight: 0.3 },
    excellent: { score: 0.95, weight: 0.2 },
    great: { score: 0.9, weight: 0.2 },
    amazing: { score: 0.95, weight: 0.2 },
    worst: { score: 0.1, weight: -0.3 },
    bad: { score: 0.3, weight: -0.2 },
    terrible: { score: 0.1, weight: -0.3 },
  };

// Comparator patterns
export const COMPARATOR_PATTERNS = [
  { pattern: /better than\s+(\w+)/i, operation: "better_than" as const },
  { pattern: /like\s+(\w+)/i, operation: "similar_to" as const },
  { pattern: /similar to\s+(\w+)/i, operation: "similar_to" as const },
  {
    pattern: /alternative(?:s)? to\s+(\w+)/i,
    operation: "alternative_to" as const,
  },
  {
    pattern: /(?:competitors?|rivals?) of\s+(\w+)/i,
    operation: "alternative_to" as const,
  },
  { pattern: /compared? to\s+(\w+)/i, operation: "better_than" as const },
];

// Valid comparator operations
export const VALID_COMPARATOR_OPS = [
  "better_than",
  "similar_to",
  "alternative_to",
] as const;
type ComparatorOp = (typeof VALID_COMPARATOR_OPS)[number];

/**
 * Extract entities using rule-based + AI hybrid approach
 */
export async function extractEntities(
  ai: Ai,
  query: string,
  shouldUseAI: boolean,
): Promise<Entity[]> {
  const entities: Entity[] = [];

  // Rule-based entity extraction (fast path)
  extractRuleBasedEntities(query, entities);

  // AI-based entity extraction for complex cases
  if (shouldUseAI) {
    try {
      const aiEntities = await extractEntitiesWithAI(ai, query);
      entities.push(...aiEntities);
    } catch (error) {
      logger.warn("AI entity extraction failed", {
        query,
        error: (error as Error).message,
      });
    }
  }

  return deduplicateEntities(entities);
}

/**
 * Extract entities using rule-based patterns
 */
export function extractRuleBasedEntities(
  query: string,
  entities: Entity[],
): void {
  // Sentiment analysis
  for (const [keyword, config] of Object.entries(SENTIMENT_MAP)) {
    if (query.includes(keyword)) {
      entities.push({
        type: "sentiment",
        value: keyword,
        confidence: config.score,
        metadata: { impact: config.weight },
      });
    }
  }

  // Comparator extraction
  for (const { pattern, operation } of COMPARATOR_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      entities.push({
        type: "comparator",
        value: match[1],
        confidence: 0.85,
        metadata: { operation },
      });
    }
  }

  // Domain extraction
  const domainPattern = /\b(\w+\.com?|app\.\w+|co\.\w+)\b/gi;
  let domainMatch: RegExpExecArray | null;
  while ((domainMatch = domainPattern.exec(query)) !== null) {
    entities.push({
      type: "domain",
      value: domainMatch[1],
      confidence: 0.9,
    });
  }

  // Category extraction
  const categories = [
    "crypto",
    "stock",
    "bank",
    "card",
    "investment",
    "trading",
    "fintech",
    "payment",
    "wallet",
  ];
  for (const cat of categories) {
    if (query.includes(cat)) {
      entities.push({
        type: "category",
        value: cat,
        confidence: 0.8,
      });
    }
  }

  // Reward type extraction
  const rewardTypes = ["cash", "credit", "stock", "crypto"];
  for (const rt of rewardTypes) {
    if (query.includes(rt)) {
      entities.push({
        type: "reward_type",
        value: rt,
        confidence: 0.75,
      });
    }
  }
}

/**
 * Extract entities using AI
 */
async function extractEntitiesWithAI(ai: Ai, query: string): Promise<Entity[]> {
  const prompt = `Extract entities from this query: "${query}"

Return ONLY a JSON object with this structure:
{
  "entities": [
    {"type": "domain|category|reward_type|sentiment|comparator", "value": "extracted value", "confidence": 0.9}
  ]
}

Guidelines:
- domain: company or service names (robinhood, coinbase, webull)
- category: product categories (crypto, stocks, banking, credit cards)
- reward_type: reward kinds (cash, credit, stock, bitcoin)
- sentiment: emotional indicators (best, worst, scam, excellent)
- comparator: comparison targets (better than X, like Y)

Respond with only valid JSON, no markdown.`;

  try {
    const result = await (ai.run as AiRunFn)(AI_MODEL, {
      prompt,
      max_tokens: AI_MAX_TOKENS_LONG,
      temperature: 0.1,
    });

    const response = result as { response: string };
    const parsed = JSON.parse(response.response.trim());

    return (parsed.entities || []).map((e: Entity) => ({
      type: e.type,
      value: e.value.toLowerCase(),
      confidence: Math.max(0, Math.min(1, e.confidence)),
      metadata: e.metadata,
    }));
  } catch (error) {
    logger.warn("AI entity parsing failed", {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Deduplicate entities keeping highest confidence
 */
export function deduplicateEntities(entities: Entity[]): Entity[] {
  const seen = new Set<string>();
  const unique: Entity[] = [];
  const sorted = [...entities].sort((a, b) => b.confidence - a.confidence);

  for (const entity of sorted) {
    const key = `${entity.type}:${entity.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entity);
    }
  }

  return unique;
}
