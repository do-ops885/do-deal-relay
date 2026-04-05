// worker/types/validation-cache.ts
export type ValidationCacheStatus =
  | "accepted"
  | "duplicate"
  | "rejected"
  | "transient_error";

export interface ValidationCacheEntry {
  status: ValidationCacheStatus;
  reason?: string;
  trustScore?: number;
  fingerprint: string;
  normalizedUrl: string;
  source?: string;
  traceId?: string;
  createdAt: string;
}
