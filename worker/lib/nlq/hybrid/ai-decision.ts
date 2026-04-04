// ============================================================================
// Hybrid Query Classifier - AI Decision Logic
// ============================================================================
// Determines when to use AI vs rule-based classification

import { isComplexQuery } from "../ai-enhancer";

export interface HybridClassifierOptions {
  aiConfidenceThreshold?: number;
  maxRuleQueryLength?: number;
  enableAIForComplex?: boolean;
  enableAIForLong?: boolean;
  longQueryThreshold?: number;
  cacheTtlSeconds?: number;
}

// Default classifier options
export const DEFAULT_CLASSIFIER_OPTIONS: Required<HybridClassifierOptions> = {
  aiConfidenceThreshold: 0.7,
  maxRuleQueryLength: 30,
  enableAIForComplex: true,
  enableAIForLong: true,
  longQueryThreshold: 50,
  cacheTtlSeconds: 3600,
};

/**
 * Select the classification method for a query
 */
export function selectMethod(
  query: string,
  options: Required<HybridClassifierOptions>,
): "rule" | "ai" {
  // Short queries are good candidates for rule-based
  if (query.length <= options.maxRuleQueryLength) {
    return "rule";
  }

  // Long queries benefit from AI
  if (options.enableAIForLong && query.length > options.longQueryThreshold) {
    return "ai";
  }

  // Complex queries need AI
  if (options.enableAIForComplex && isComplexQuery(query)) {
    return "ai";
  }

  // Default to rules for speed
  return "rule";
}

/**
 * Check if AI should be used for a query
 */
export function shouldUseAI(
  query: string,
  options?: HybridClassifierOptions,
): boolean {
  const opts = { ...DEFAULT_CLASSIFIER_OPTIONS, ...options };

  if (query.length > opts.maxRuleQueryLength) return true;
  if (opts.enableAIForComplex && isComplexQuery(query)) return true;
  if (opts.enableAIForLong && query.length > opts.longQueryThreshold)
    return true;

  return false;
}
