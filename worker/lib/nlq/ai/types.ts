// ============================================================================
// AI-Powered Natural Language Query Enhancer Types
// ============================================================================

export interface Entity {
  type: "domain" | "category" | "reward_type" | "sentiment" | "comparator";
  value: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface ExtractedIntent {
  primary: "search" | "compare" | "filter" | "rank" | "discover";
  confidence: number;
  secondary?: string;
}

export interface QueryExpansion {
  original: string;
  expanded: string[];
  synonyms: Map<string, string[]>;
}

export interface EnhancedQuery {
  original: string;
  normalized: string;
  entities: Entity[];
  intent: ExtractedIntent;
  expansion: QueryExpansion;
  filters: QueryFilters;
  aiConfidence: number;
  processingTimeMs: number;
}

export interface QueryFilters {
  minTrustScore?: number;
  minRanking?: number;
  categories?: string[];
  excludeCategories?: string[];
  rewardTypes?: string[];
  domains?: string[];
  excludeDomains?: string[];
  sentimentFilter?: "positive" | "negative" | "neutral";
  comparator?: {
    target: string;
    operation: "better_than" | "similar_to" | "alternative_to";
  };
}

export interface AIEnhancerOptions {
  useCache?: boolean;
  cacheTtlSeconds?: number;
  minConfidenceThreshold?: number;
  maxQueryLength?: number;
  enableQueryExpansion?: boolean;
}
