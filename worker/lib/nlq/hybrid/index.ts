// ============================================================================
// Hybrid Query Classifier
// ============================================================================
// Combines rule-based classification with AI for optimal speed/accuracy tradeoff

import { logger } from "../../global-logger";
import type { Env } from "../../../types";
import type { EnhancedQuery, QueryFilters } from "../ai";
import { AIQueryEnhancer } from "../ai";
import { isFeatureEnabledWithDefaults } from "../../feature-flags";
import { classifyWithRules } from "./rule-classifier";
import {
  selectMethod,
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
   * ADR-032: nlq_ai_enhancement kill switch. Fails closed to rule-based
   * classification when the flag is off or KV is unavailable (the flag
   * helpers swallow KV errors and report disabled).
   */
  private async isAiEnhancementEnabled(): Promise<boolean> {
    return isFeatureEnabledWithDefaults("nlq_ai_enhancement", this.env);
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
      enhanced = classifyWithRules(query, startTime, this.env);
    } else {
      if (!this.aiEnhancer || !this.ai) {
        // Fallback to rules if AI unavailable
        enhanced = classifyWithRules(query, startTime, this.env);
      } else if (!(await this.isAiEnhancementEnabled())) {
        // ADR-032: nlq_ai_enhancement kill switch — rule-based fallback.
        enhanced = classifyWithRules(query, startTime, this.env);
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
      classifyWithRules(q, Date.now(), this.env),
    );

    // Process complex queries with AI (ADR-032: nlq_ai_enhancement gate).
    // Complex queries fall back to rules when the flag is off or AI is
    // unavailable so they are never silently dropped from the results.
    const complexResults: EnhancedQuery[] = [];
    const aiEnabled =
      this.aiEnhancer !== null && (await this.isAiEnhancementEnabled());
    if (this.aiEnhancer && aiEnabled && complexQueries.length > 0) {
      for (const query of complexQueries) {
        complexResults.push(await this.aiEnhancer.enhance(query));
      }
    } else {
      for (const query of complexQueries) {
        complexResults.push(classifyWithRules(query, Date.now(), this.env));
      }
    }

    // Combine results
    const results: ClassifierResult[] = [];

    for (let i = 0; i < simpleQueries.length; i++) {
      const result = simpleResults[i];
      if (result) {
        results.push({
          query: result,
          method: "rule",
          confidence: result.aiConfidence,
          processingTimeMs: result.processingTimeMs,
          appliedFilters: this.determineFilters(result),
        });
      }
    }

    for (let i = 0; i < complexQueries.length; i++) {
      const result = complexResults[i];
      if (result) {
        results.push({
          query: result,
          method: "ai",
          confidence: result.aiConfidence,
          processingTimeMs: result.processingTimeMs,
          appliedFilters: this.determineFilters(result),
        });
      }
    }

    // Restore original order
    const ordered: ClassifierResult[] = [];
    let simpleIdx = 0;
    let complexIdx = 0;

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      if (query !== undefined && selectMethod(query, this.options) === "rule") {
        const result = results[simpleIdx++];
        if (result) ordered.push(result);
      } else {
        const result = results[simpleQueries.length + complexIdx++];
        if (result) ordered.push(result);
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
