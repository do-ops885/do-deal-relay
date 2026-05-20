/**
 * NLQ System Index
 *
 * This module provides a unified interface for the Natural Language Query (NLQ) processing system.
 * It combines tokenization, parsing, intent classification (both rule-based and AI-powered),
 * and query building into a single point of access.
 *
 * @module worker/lib/nlq
 */

// ============================================================================
// NLQ System Index
// ============================================================================
// Natural Language Query processing with AI-powered enhancement

export {
  /** AI-powered query enhancer class */
  AIQueryEnhancer,
  /** Enhance a single query using AI */
  enhanceQuery,
  /** Enhance a batch of queries using AI */
  enhanceQueriesBatch,
  /** Determine if a query is complex enough to require AI */
  isComplexQuery,
  /** Map of terms to their synonyms */
  SYNONYM_MAP,
  /** Valid operations for comparison queries */
  VALID_COMPARATOR_OPS,
} from "./ai";

export type {
  /** Extracted entity representation */
  Entity,
  /** Classified intent with confidence */
  ExtractedIntent,
  /** Result of query expansion */
  QueryExpansion,
  /** Fully enhanced query with filters and entities */
  EnhancedQuery,
  /** Structured query filters */
  QueryFilters,
  /** Options for the AI enhancer */
  AIEnhancerOptions,
} from "./ai/types";

export {
  /** Hybrid (rule + AI) classifier class */
  HybridClassifier,
  /** Classify query intent using hybrid approach */
  classifyQuery,
  /** Classify batch of queries */
  classifyQueriesBatch,
  /** Heuristic to decide if AI classification is needed */
  shouldUseAI,
  /** Create a new hybrid classifier instance */
  createClassifier,
} from "./hybrid";

export type {
  /** Result of hybrid classification */
  ClassifierResult,
  /** Options for the hybrid classifier */
  HybridClassifierOptions,
} from "./hybrid";

export {
  /** Convert text into a stream of tokens */
  tokenize,
  /** Remove common stopwords from a token stream */
  removeStopwords,
  /** High-level query parsing into structured representation */
  parseQuery,
  /** Prepare query for FTS5 search by removing noise */
  cleanQueryForSearch,
  /** Extract entities from tokens or text */
  extractEntities,
  /** Get the most relevant entities from a query */
  getTopEntities,
} from "./parser";

export {
  /** Build a structured query object from a natural language input */
  buildStructuredQuery,
  /** Generate a SQL WHERE clause from filters */
  buildWhereClause,
  /** Generate a SQL ORDER BY clause from filters */
  buildOrderByClause,
  /** Execute a structured query against the database */
  executeStructuredQuery,
  /** Provide a human-readable explanation of how a query was parsed */
  explainQuery,
} from "./query-builder";
