import { z } from "zod";

// ============================================================================
// Core Deal Schema
// ============================================================================

export const RewardTypeSchema = z.enum(["cash", "credit", "percent", "item"]);

export const RewardSchema = z.object({
  type: RewardTypeSchema,
  value: z.union([z.number(), z.string()]),
  currency: z.string().optional(),
  description: z.string().optional(),
});

export const SourceSchema = z.object({
  url: z.string().url(),
  domain: z.string(),
  discovered_at: z.string().datetime(),
  trust_score: z.number().min(0).max(1),
});

export const ExpirySchema = z.object({
  date: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1),
  type: z.enum(["hard", "soft", "unknown"]),
});

export const DealMetadataSchema = z.object({
  category: z.array(z.string()),
  tags: z.array(z.string()),
  normalized_at: z.string().datetime(),
  confidence_score: z.number().min(0),
  status: z.enum(["active", "quarantined", "rejected"]),
  validation_gates: z
    .object({
      passed: z.array(z.string()),
      failed: z.array(z.string()),
      timestamp: z.string().datetime(),
    })
    .optional(),
});

export const DealSchema = z.object({
  id: z.string(),
  source: SourceSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  code: z.string().min(1).max(100),
  url: z.string().url(),
  reward: RewardSchema,
  requirements: z.array(z.string()).optional(),
  expiry: ExpirySchema,
  metadata: DealMetadataSchema,
});

export type RewardType = z.infer<typeof RewardTypeSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Expiry = z.infer<typeof ExpirySchema>;
export type DealMetadata = z.infer<typeof DealMetadataSchema>;
export type Deal = z.infer<typeof DealSchema>;

// ============================================================================
// Snapshot Schema
// ============================================================================

export const SnapshotStatsSchema = z.object({
  total: z.number().int().min(0),
  active: z.number().int().min(0),
  quarantined: z.number().int().min(0),
  rejected: z.number().int().min(0),
  duplicates: z.number().int().min(0),
});

export const SnapshotSchema = z.object({
  version: z.string(),
  generated_at: z.string().datetime(),
  run_id: z.string(),
  trace_id: z.string(),
  snapshot_hash: z.string(),
  previous_hash: z.string(),
  schema_version: z.string(),
  stats: SnapshotStatsSchema,
  deals: z.array(DealSchema),
});

export type SnapshotStats = z.infer<typeof SnapshotStatsSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
