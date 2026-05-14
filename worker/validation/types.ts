import { Deal, PipelineContext } from "../pipeline/types";

export interface ValidationResult {
  valid: Deal[];
  invalid: Array<{ deal: Deal; reasons: string[] }>;
  quarantined: Deal[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    quarantined: number;
    by_gate: Record<string, number>;
  };
}

export interface GateResult {
  passed: boolean;
  reason?: string;
}

// Type-safe context hash storage helper - avoids unsafe casting
// PipelineContext is extended with an index signature for metadata storage
export interface ContextWithHashes extends PipelineContext {
  [key: `deal_hash_${string}`]: string;
}

/**
 * Get a hash value from context using type-safe access
 */
export function getContextHash(
  ctx: PipelineContext,
  dealId: string,
): string | undefined {
  return (ctx as ContextWithHashes)[`deal_hash_${dealId}`];
}

/**
 * Store a hash value in context using type-safe access
 */
export function setContextHash(
  ctx: PipelineContext,
  dealId: string,
  hash: string,
): void {
  (ctx as ContextWithHashes)[`deal_hash_${dealId}`] = hash;
}
