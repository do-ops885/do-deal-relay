# GOAP Plan: Semantic Search Implementation (Issues #294-#296)

## Architecture Decision Record (ADR)

### Context
The do-deal-relay system currently supports keyword-based search via the NLQ endpoint and category/tag matching. Users need semantic search capabilities to find deals based on meaning and intent rather than exact keyword matches. For example, searching for "investment opportunities with sign-up bonuses" should find trading platform referral codes even if they don't contain those exact words.

### Decision
Implement semantic search using:
1. **Cloudflare Vectorize** for vector storage and similarity search
2. **Workers AI** (`@cf/baai/bge-base-en-v1.5`) for generating 768-dimensional embeddings
3. **Cosine similarity** as the distance metric (optimal for text semantic search)

### Consequences
- **Positive**: Enables natural language deal discovery, improves user experience
- **Positive**: Leverages existing Cloudflare infrastructure (no external services)
- **Positive**: Integrates with existing NLQ endpoint for hybrid search
- **Negative**: Requires Vectorize index management and embedding pipeline
- **Negative**: Adds ~100ms latency for embedding generation on queries

---

## Task Decomposition

### Issue #294: Vectorize Index Schema Design
**Status**: ✅ Complete
- [x] Design index schema with 768 dimensions (bge-base-en-v1.5)
- [x] Define metadata structure (deal_id, domain, category, tags, status)
- [x] Create metadata indexes for filtering

### Issue #295: Semantic Search API Endpoint
**Status**: ✅ Complete
- [x] Create `/api/search/semantic` endpoint
- [x] Implement cosine similarity ranking
- [x] Add hybrid search combining semantic + keyword
- [x] Add rate limiting and authentication

### Issue #296: Embedding Generation Pipeline
**Status**: ✅ Complete
- [x] Create embedding generation service
- [x] Implement batch embedding for deal ingestion
- [x] Add scheduled job for re-embedding new/updated deals
- [x] Handle embedding cache invalidation

---

## Implementation Details

### 1. Vectorize Index Configuration

**Index Name**: `deal-embeddings`
**Dimensions**: 768 (matching bge-base-en-v1.5)
**Metric**: cosine

**Metadata Schema**:
```typescript
interface DealEmbeddingMetadata {
  deal_id: string;        // Reference to deal.id
  domain: string;         // Source domain (e.g., "trading212.com")
  category: string[];     // Deal categories
  tags: string[];         // Deal tags
  status: string;         // "active", "quarantined", "rejected"
  reward_type: string;    // "cash", "credit", "percent", "item"
  created_at: number;     // Timestamp bucket (5-min intervals)
}
```

### 2. Semantic Search API

**Endpoint**: `POST /api/search/semantic`

**Request Body**:
```typescript
{
  query: string;           // Natural language search query
  limit?: number;          // Max results (default: 20, max: 100)
  filters?: {
    domain?: string;
    category?: string;
    min_reward?: number;
    status?: "active" | "all";
  };
  hybrid?: boolean;        // Enable hybrid semantic + keyword search
}
```

**Response**:
```typescript
{
  success: boolean;
  query: string;
  results: Array<{
    deal: Deal;
    score: number;         // Cosine similarity score (0-1)
    match_type: "semantic" | "hybrid" | "keyword";
  }>;
  meta: {
    total: number;
    execution_time_ms: number;
    model: string;
    index_version: string;
  };
}
```

### 3. Embedding Generation Pipeline

**Trigger Points**:
1. On new deal ingestion (via webhook or pipeline)
2. Scheduled re-embedding (daily cron)
3. Manual re-index via admin API

**Text Representation for Embedding**:
```typescript
function buildDealEmbeddingText(deal: Deal): string {
  return [
    deal.title,
    deal.description,
    deal.metadata.category.join(" "),
    deal.metadata.tags.join(" "),
    deal.source.domain,
    deal.reward.description || "",
  ].filter(Boolean).join(" | ");
}
```

---

## Files to Create/Modify

### New Files
1. `worker/lib/search/semantic-search.ts` - Core semantic search service
2. `worker/lib/search/embedding-pipeline.ts` - Embedding generation pipeline
3. `worker/routes/search.ts` - Search API routes
4. `worker/lib/search/types.ts` - Search-specific types

### Modified Files
1. `worker/types.ts` - Add Vectorize binding to Env
2. `worker/index.ts` - Add search routes
3. `worker/config.ts` - Add search configuration constants
4. `wrangler.jsonc` - Add Vectorize binding and metadata indexes

---

## Success Criteria

- [ ] Semantic search returns relevant results for natural language queries
- [ ] Hybrid search combines semantic + keyword matching
- [ ] Embedding pipeline processes new deals within 30 seconds
- [ ] Search latency < 500ms for 95th percentile
- [ ] All existing tests pass
- [ ] Rate limiting prevents abuse
