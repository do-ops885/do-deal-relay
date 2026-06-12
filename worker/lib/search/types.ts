/**
 * Semantic Search Types
 *
 * Type definitions for Vectorize-based semantic search.
 * Includes embedding metadata, search queries, and results.
 */

import { z } from "zod";
import type { Deal } from "../../types";

// ============================================================================
// Vectorize Embedding Types
// ============================================================================

/**
 * Metadata stored alongside each vector in Vectorize.
 * Used for filtering and context retrieval.
 */
export interface DealEmbeddingMetadata {
  /** Reference to the original deal ID */
  deal_id: string;
  /** Source domain (e.g., "trading212.com") */
  domain: string;
  /** Deal categories */
  category: string[];
  /** Deal tags */
  tags: string[];
  /** Deal status */
  status: "active" | "quarantined" | "rejected";
  /** Reward type */
  reward_type: "cash" | "credit" | "percent" | "item";
  /** Timestamp bucket (5-minute intervals for cardinality) */
  created_at_bucket: number;
}

/**
 * Vectorize vector with embedding and metadata.
 */
export interface DealVector {
  id: string;
  values: number[];
  namespace?: string;
  metadata: DealEmbeddingMetadata;
}

// ============================================================================
// Search Request/Response Types
// ============================================================================

/**
 * Filter options for semantic search.
 */
export const SemanticSearchFiltersSchema = z.object({
  domain: z.string().optional(),
  category: z.string().optional(),
  min_reward: z.number().optional(),
  status: z.enum(["active", "all"]).optional(),
  tags: z.array(z.string()).optional(),
});

export type SemanticSearchFilters = z.infer<typeof SemanticSearchFiltersSchema>;

/**
 * Semantic search request body.
 */
export const SemanticSearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional().default(20),
  filters: SemanticSearchFiltersSchema.optional(),
  hybrid: z.boolean().optional().default(false),
  min_score: z.number().min(0).max(1).optional().default(0.3),
});

export type SemanticSearchRequest = z.infer<typeof SemanticSearchRequestSchema>;

/**
 * Individual search result with similarity score.
 */
export interface SemanticSearchResult {
  deal: DealEmbeddingMetadata;
  score: number;
  match_type: "semantic" | "hybrid" | "keyword";
}

/**
 * Semantic search response.
 */
export interface SemanticSearchResponse {
  success: boolean;
  query: string;
  results: SemanticSearchResult[];
  meta: {
    total: number;
    returned: number;
    execution_time_ms: number;
    embedding_time_ms: number;
    vectorize_time_ms: number;
    model: string;
    index_name: string;
    filters_applied: string[];
  };
}

/**
 * Error response for search failures.
 */
export interface SemanticSearchError {
  error: string;
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Embedding Pipeline Types
// ============================================================================

/**
 * Configuration for the embedding pipeline.
 */
export interface EmbeddingPipelineConfig {
  /** Embedding model identifier */
  model: string;
  /** Batch size for embedding generation */
  batch_size: number;
  /** Maximum concurrent embedding requests */
  max_concurrent: number;
  /** Embedding cache TTL in seconds */
  cache_ttl_seconds: number;
}

/**
 * Result of embedding a single deal.
 */
export interface EmbeddingResult {
  deal_id: string;
  success: boolean;
  vector_id?: string;
  error?: string;
  duration_ms: number;
}

/**
 * Result of a batch embedding operation.
 */
export interface BatchEmbeddingResult {
  total: number;
  successful: number;
  failed: number;
  results: EmbeddingResult[];
  total_duration_ms: number;
}

/**
 * Embedding cache entry.
 */
export interface EmbeddingCacheEntry {
  text_hash: string;
  vector: number[];
  created_at: number;
  expires_at: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingPipelineConfig = {
  model: "@cf/baai/bge-base-en-v1.5",
  batch_size: 100, // Max 100 texts per embedding request
  max_concurrent: 3,
  cache_ttl_seconds: 86400, // 24 hours
};

export const SEMANTIC_SEARCH_CONFIG = {
  /** Default similarity threshold */
  DEFAULT_MIN_SCORE: 0.3,
  /** Maximum query length */
  MAX_QUERY_LENGTH: 500,
  /** Default result limit */
  DEFAULT_LIMIT: 20,
  /** Maximum result limit */
  MAX_LIMIT: 100,
  /** Embedding model dimensions */
  EMBEDDING_DIMENSIONS: 768,
  /** Vectorize index name */
  INDEX_NAME: "deal-embeddings",
  /** Namespace for production embeddings */
  PRODUCTION_NAMESPACE: "prod",
  /** Namespace for staging embeddings */
  STAGING_NAMESPACE: "staging",
} as const;
