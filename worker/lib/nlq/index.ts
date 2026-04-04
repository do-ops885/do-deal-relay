// ============================================================================
// NLQ System Index
// ============================================================================
// Natural Language Query processing with AI-powered enhancement

export {
  AIQueryEnhancer,
  enhanceQuery,
  enhanceQueriesBatch,
  isComplexQuery,
  SYNONYM_MAP,
  VALID_COMPARATOR_OPS,
} from "./ai";

export type {
  Entity,
  ExtractedIntent,
  QueryExpansion,
  EnhancedQuery,
  QueryFilters,
  AIEnhancerOptions,
} from "./ai/types";

export {
  HybridClassifier,
  classifyQuery,
  classifyQueriesBatch,
  shouldUseAI,
  createClassifier,
} from "./hybrid";

export type { ClassifierResult, HybridClassifierOptions } from "./hybrid";

export {
  tokenize,
  removeStopwords,
  parseQuery,
  cleanQueryForSearch,
  extractEntities,
  getTopEntities,
} from "./parser";

export {
  buildStructuredQuery,
  buildWhereClause,
  buildOrderByClause,
  executeStructuredQuery,
  explainQuery,
} from "./query-builder";
