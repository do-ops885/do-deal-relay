# Data Agent

**Agent ID**: `data-agent`
**Status**: 🟢 Complete
**Scope**: TypeScript types, Zod schemas, data models
**Parallel Agent**: Bootstrap Agent (already done)

## Deliverables (Complete ✅)

### Types

- [x] `worker/types.ts` - Complete type definitions
  - Deal schema
  - Reward schema
  - Source schema
  - Expiry schema
  - Metadata schema
  - Snapshot schema
  - LogEntry schema
  - SourceConfig schema
  - Pipeline types
  - Error taxonomy
  - API types
  - GOAP types

### Schema Validation

- All schemas use Zod for runtime validation
- Strict TypeScript types
- No `any` types
- Explicit return types

## Data Models

### Deal

```typescript
{
  id: string;                    // Canonical ID (SHA256)
  source: {
    url: string;
    domain: string;
    discovered_at: string;
    trust_score: number;          // 0-1
  };
  title: string;
  description: string;
  code: string;                    // Referral code
  url: string;
  reward: {
    type: 'cash' | 'credit' | 'percent' | 'item';
    value: number | string;
    currency?: string;
  };
  requirements?: string[];
  expiry: {
    date?: string;
    confidence: number;            // 0-1
    type: 'hard' | 'soft' | 'unknown';
  };
  metadata: {
    category: string[];
    tags: string[];
    normalized_at: string;
    confidence_score: number;
    status: 'active' | 'quarantined' | 'rejected';
  };
}
```

### Snapshot

```typescript
{
  version: string;
  generated_at: string;
  run_id: string;
  trace_id: string;
  snapshot_hash: string;
  previous_hash: string;
  schema_version: string;
  stats: {
    total: number;
    active: number;
    quarantined: number;
    rejected: number;
    duplicates: number;
  };
  deals: Deal[];
}
```

### LogEntry

```typescript
{
  run_id: string;
  trace_id: string;
  ts: string;
  phase: PipelinePhase;
  status: 'complete' | 'incomplete' | 'error';
  candidate_count?: number;
  valid_count?: number;
  duplicate_count?: number;
  rejected_count?: number;
  rejection_reasons?: string[];
  confidence_score?: number;
  trust_score?: number;
  source_urls?: string[];
  source_hashes?: string[];
  previous_snapshot_hash?: string;
  new_snapshot_hash?: string;
  duration_ms?: number;
  retry_count?: number;
  notification_sent?: boolean;
  error_class?: string;
  error_message?: string;
}
```

## Handoff

This agent's work is complete and available for all other agents.

## Status

✅ **COMPLETE** - All types and schemas defined and ready for use.
