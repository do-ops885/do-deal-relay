// ============================================================================
// AI-Powered Natural Language Query Enhancer
// ============================================================================
// Uses Workers AI to understand complex queries and extract implicit entities

import { sha256 } from "../../crypto";
import { KVCache } from "../../cache";
import { logger } from "../../global-logger";
import { CONFIG } from "../../../config";
import type { Env } from "../../../types";
import type { EnhancedQuery, QueryFilters, AIEnhancerOptions } from "./types";
import { extractEntities, deduplicateEntities } from "./entities";
import { classifyIntent, validateIntent } from "./intent";
import { expandQuery, createEmptyExpansion, SYNONYM_MAP } from "./expansion";

export type {
  Entity,
  ExtractedIntent,
  QueryExpansion,
  EnhancedQuery,
  QueryFilters,
  AIEnhancerOptions,
} from "./types";

export { SYNONYM_MAP } from "./expansion";
export { VALID_COMPARATOR_OPS } from "./entities";

// ============================================================================
// Constants
// ============================================================================

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

const AI_MAX_TOKENS_LONG = CONFIG.NLQ_AI_MAX_TOKENS_LONG;
const AI_MAX_TOKENS_SHORT = CONFIG.NLQ_AI_MAX_TOKENS_SHORT;

const CACHE_TTL_SECONDS = CONFIG.NLQ_AI_CACHE_TTL_MINUTES * 60;

const MAX_QUERY_LENGTH = CONFIG.NLQ_MAX_QUERY_LENGTH;

const CONFIDENCE_THRESHOLD = CONFIG.NLQ_AI_CONFIDENCE_THRESHOLD;

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<AIEnhancerOptions> = {
  useCache: true,
  cacheTtlSeconds: CACHE_TTL_SECONDS,
  minConfidenceThreshold: CONFIDENCE_THRESHOLD - 0.05, // Slightly lower than threshold
  maxQueryLength: MAX_QUERY_LENGTH,
  enableQueryExpansion: true,
};

// ============================================================================
// AI Enhancer Class
// ============================================================================

export class AIQueryEnhancer {
  private ai: Ai;
  private env: Env;
  private cache: KVCache | null;
  private options: Required<AIEnhancerOptions>;

  constructor(ai: Ai, env: Env, options: AIEnhancerOptions = {}) {
    this.ai = ai;
    this.env = env;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.cache = this.options.useCache
      ? new KVCache(env.DEALS_SOURCES, this.options.cacheTtlSeconds, "nlq_ai")
      : null;
  }

  /**
   * Main entry point: enhance a natural language query using AI
   */
  async enhance(query: string): Promise<EnhancedQuery> {
    const startTime = Date.now();

    // Validate and normalize input
    const normalized = this.normalizeQuery(query);
    if (!normalized) {
      return this.createEmptyEnhancedQuery(query, startTime);
    }

    // Check cache first
    if (this.cache) {
      const cacheKey = await this.generateCacheKey(normalized);
      const cached = await this.cache.get<EnhancedQuery>(cacheKey);
      if (cached) {
        logger.debug("NLQ AI cache hit", { query: normalized });
        return {
          ...cached,
          processingTimeMs: Date.now() - startTime,
        };
      }
    }

    const shouldUseAI = this.shouldUseAI(query);

    // Extract entities using rule-based + AI hybrid approach
    const [entities, intent, expansion] = await Promise.all([
      extractEntities(this.ai, normalized, shouldUseAI),
      classifyIntent(this.ai, normalized),
      this.options.enableQueryExpansion
        ? expandQuery(this.ai, normalized, shouldUseAI)
        : Promise.resolve(createEmptyExpansion(normalized)),
    ]);

    // Build filters from extracted entities
    const filters = this.buildFilters(entities);

    // Calculate overall AI confidence
    const aiConfidence = this.calculateConfidence(entities, intent);

    const enhanced: EnhancedQuery = {
      original: query,
      normalized,
      entities,
      intent,
      expansion,
      filters,
      aiConfidence,
      processingTimeMs: Date.now() - startTime,
    };

    // Cache the result
    if (this.cache && aiConfidence >= this.options.minConfidenceThreshold) {
      const cacheKey = await this.generateCacheKey(normalized);
      await this.cache.set(cacheKey, enhanced);
    }

    logger.info("Query enhanced with AI", {
      query: normalized,
      intent: intent.primary,
      confidence: aiConfidence,
      entities: entities.length,
      processingTimeMs: enhanced.processingTimeMs,
    });

    return enhanced;
  }

  /**
   * Quick check if AI enhancement is needed for this query
   */
  shouldUseAI(query: string): boolean {
    const normalized = this.normalizeQuery(query);
    if (!normalized) return false;

    const complexPatterns = [
      /\b(best|top|worst)\b/i,
      /\b(better than|like|similar to|alternative to)\b/i,
      /\b(scam|fraud|fake)\b/i,
      /\b(compared? to|versus|vs)\b/i,
      /\b(recommend|suggestion|what is)\b/i,
      /\b(how do|how can|how to)\b/i,
    ];

    return complexPatterns.some((pattern) => pattern.test(normalized));
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private normalizeQuery(query: string): string {
    return query
      .trim()
      .toLowerCase()
      .slice(0, this.options.maxQueryLength)
      .replace(/\s+/g, " ");
  }

  private async generateCacheKey(query: string): Promise<string> {
    const hash = await sha256(query);
    return `ai:${hash.slice(0, 32)}`;
  }

  private buildFilters(entities: import("./types").Entity[]): QueryFilters {
    const filters: QueryFilters = {};
    const VALID_COMPARATOR_OPS = [
      "better_than",
      "similar_to",
      "alternative_to",
    ] as const;
    type ComparatorOp = (typeof VALID_COMPARATOR_OPS)[number];

    for (const entity of entities) {
      switch (entity.type) {
        case "sentiment": {
          const impact = entity.metadata?.impact as number;
          if (impact > 0) {
            filters.minTrustScore = Math.max(
              filters.minTrustScore || 0,
              entity.confidence * 0.9,
            );
          } else if (impact < 0) {
            filters.sentimentFilter = "negative";
            filters.minTrustScore = 0.3;
          }
          break;
        }
        case "comparator": {
          const operation = entity.metadata?.operation;
          if (
            operation &&
            VALID_COMPARATOR_OPS.includes(operation as ComparatorOp)
          ) {
            filters.comparator = {
              target: entity.value,
              operation: operation as ComparatorOp,
            };
          }
          break;
        }
        case "category": {
          filters.categories = [...(filters.categories || []), entity.value];
          break;
        }
        case "domain": {
          filters.domains = [...(filters.domains || []), entity.value];
          break;
        }
        case "reward_type": {
          filters.rewardTypes = [...(filters.rewardTypes || []), entity.value];
          break;
        }
      }
    }

    // High ranking for "best", "top" queries
    const hasBestIntent = entities.some(
      (e) =>
        e.type === "sentiment" &&
        ["best", "top", "excellent"].includes(e.value),
    );
    if (hasBestIntent) {
      filters.minRanking = 0.8;
    }

    return filters;
  }

  private calculateConfidence(
    entities: import("./types").Entity[],
    intent: import("./types").ExtractedIntent,
  ): number {
    if (entities.length === 0) return intent.confidence * 0.5;

    const avgEntityConfidence =
      entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length;

    return avgEntityConfidence * 0.6 + intent.confidence * 0.4;
  }

  private createEmptyEnhancedQuery(
    query: string,
    startTime: number,
  ): EnhancedQuery {
    return {
      original: query,
      normalized: query,
      entities: [],
      intent: { primary: "search", confidence: 0.5 },
      expansion: createEmptyExpansion(query),
      filters: {},
      aiConfidence: 0.5,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function enhanceQuery(
  query: string,
  ai: Ai,
  env: Env,
  options?: AIEnhancerOptions,
): Promise<EnhancedQuery> {
  const enhancer = new AIQueryEnhancer(ai, env, options);
  return enhancer.enhance(query);
}

export function isComplexQuery(query: string): boolean {
  const enhancer = new AIQueryEnhancer({} as Ai, {} as Env);
  return enhancer.shouldUseAI(query);
}

export async function enhanceQueriesBatch(
  queries: string[],
  ai: Ai,
  env: Env,
  options?: AIEnhancerOptions,
): Promise<EnhancedQuery[]> {
  const enhancer = new AIQueryEnhancer(ai, env, options);
  const batchSize = 5;
  const results: EnhancedQuery[] = [];

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((q) => enhancer.enhance(q)),
    );
    results.push(...batchResults);
  }

  return results;
}
