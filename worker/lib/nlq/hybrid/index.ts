// ============================================================================
// Hybrid Query Classifier
// ============================================================================
// Combines rule-based classification with AI for optimal speed/accuracy tradeoff

import { logger } from "../../global-logger";
import type { Env } from "../../../types";
import type { EnhancedQuery, QueryFilters } from "../ai-enhancer";
import { AIQueryEnhancer, isComplexQuery } from "../ai-enhancer";
import {
  classifyWithRules,
  normalizeQuery,
  buildFiltersFromEntities,
  calculateRuleConfidence,
} from "./rule-classifier";
import {
  selectMethod,
  shouldUseAI,
  DEFAULT_CLASSIFIER_OPTIONS,
  type HybridClassifierOptions,
} from "./ai-decision";

export interface ClassifierResult {
  query: EnhancedQuery;
  method: "rule" | "ai" | "hybrid";
  confidence: number;
  processingTimeMs: number;
  appliedFilters: QueryFilters;
}

export type { HybridClassifierOptions } from "./ai-decision";

// ============================================================================
// Hybrid Classifier Class
// ============================================================================

export class HybridClassifier {
  private ai: Ai | null;
  private env: Env;
  private options: Required<HybridClassifierOptions>;
  private aiEnhancer: AIQueryEnhancer | null;

  constructor(ai: Ai | null, env: Env, options: HybridClassifierOptions = {}) {
    this.ai = ai;
    this.env = env;
    this.options = { ...DEFAULT_CLASSIFIER_OPTIONS, ...options };
    this.aiEnhancer = ai
      ? new AIQueryEnhancer(ai, env, {
          cacheTtlSeconds: this.options.cacheTtlSeconds,
        })
      : null;
  }

  /**
   * Classify a query using the optimal method (rule-based or AI)
   */
  async classify(query: string): Promise<ClassifierResult> {
    const startTime = Date.now();

    // Decide classification method
    const method = selectMethod(query, this.options);

    let enhanced: EnhancedQuery;

    if (method === "rule") {
      enhanced = classifyWithRules(query, startTime);
    } else {
      if (!this.aiEnhancer || !this.ai) {
        // Fallback to rules if AI unavailable
        enhanced = classifyWithRules(query, startTime);
      } else {
        enhanced = await this.aiEnhancer.enhance(query);
      }
    }

    const processingTimeMs = Date.now() - startTime;
    const appliedFilters = this.determineFilters(enhanced);

    logger.info("Query classified", {
      query: enhanced.normalized,
      method,
      intent: enhanced.intent.primary,
      confidence: enhanced.aiConfidence,
      processingTimeMs,
    });

    return {
      query: enhanced,
      method,
      confidence: enhanced.aiConfidence,
      processingTimeMs,
      appliedFilters,
    };
  }

  /**
   * Batch classify multiple queries
   */
  async classifyBatch(queries: string[]): Promise<ClassifierResult[]> {
    // Separate simple from complex
    const simpleQueries: string[] = [];
    const complexQueries: string[] = [];

    for (const query of queries) {
      if (selectMethod(query, this.options) === "rule") {
        simpleQueries.push(query);
      } else {
        complexQueries.push(query);
      }
    }

    // Process simple queries with rules (fast)
    const simpleResults = simpleQueries.map((q) =>
      classifyWithRules(q, Date.now()),
    );

    // Process complex queries with AI
    const complexResults: EnhancedQuery[] = [];
    if (this.aiEnhancer && complexQueries.length > 0) {
      for (const query of complexQueries) {
        complexResults.push(await this.aiEnhancer.enhance(query));
      }
    }

    // Combine results
    const results: ClassifierResult[] = [];

    for (let i = 0; i < simpleQueries.length; i++) {
      results.push({
        query: simpleResults[i],
        method: "rule",
        confidence: simpleResults[i].aiConfidence,
        processingTimeMs: simpleResults[i].processingTimeMs,
        appliedFilters: this.determineFilters(simpleResults[i]),
      });
    }

    for (let i = 0; i < complexQueries.length; i++) {
      results.push({
        query: complexResults[i],
        method: "ai",
        confidence: complexResults[i].aiConfidence,
        processingTimeMs: complexResults[i].processingTimeMs,
        appliedFilters: this.determineFilters(complexResults[i]),
      });
    }

    // Restore original order
    const ordered: ClassifierResult[] = new Array(queries.length);
    let simpleIdx = 0;
    let complexIdx = 0;

    for (let i = 0; i < queries.length; i++) {
      if (selectMethod(queries[i], this.options) === "rule") {
        ordered[i] = results[simpleIdx++];
      } else {
        ordered[i] = results[simpleQueries.length + complexIdx++];
      }
    }

    return ordered;
  }

  /**
   * Get classifier statistics for monitoring
   */
  getStats(): {
    aiAvailable: boolean;
    cacheEnabled: boolean;
    options: Required<HybridClassifierOptions>;
  } {
    return {
      aiAvailable: this.ai !== null,
      cacheEnabled: this.aiEnhancer !== null,
      options: this.options,
    };
  }

  private determineFilters(enhanced: EnhancedQuery): QueryFilters {
    return enhanced.filters;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Classify a single query
 */
export async function classifyQuery(
  query: string,
  ai: Ai | null,
  env: Env,
  options?: HybridClassifierOptions,
): Promise<ClassifierResult> {
  const classifier = new HybridClassifier(ai, env, options);
  return classifier.classify(query);
}

/**
 * Batch classify multiple queries
 */
export async function classifyQueriesBatch(
  queries: string[],
  ai: Ai | null,
  env: Env,
  options?: HybridClassifierOptions,
): Promise<ClassifierResult[]> {
  const classifier = new HybridClassifier(ai, env, options);
  return classifier.classifyBatch(queries);
}

/**
 * Create a classifier with default options
 */
export function createClassifier(
  ai: Ai | null,
  env: Env,
  options?: HybridClassifierOptions,
): HybridClassifier {
  return new HybridClassifier(ai, env, options);
}

export { shouldUseAI } from "./ai-decision";
