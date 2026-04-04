// ============================================================================
// AI-Powered Natural Language Query Enhancer
// ============================================================================
// Uses Workers AI to understand complex queries and extract implicit entities
//
// @deprecated Use ./ai/index.ts instead

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
} from "./ai";
