/**
 * Semantic Search HTTP Route
 *
 * Exposes /api/semantic-search for natural-language queries over deals.
 * Uses Cloudflare Vectorize + Workers AI for embeddings.
 * When hybrid=true fuses FTS5 keyword search (D1) and vector search via RRF.
 *
 * Free tier constraints (Vectorize):
 * - topK capped at 50
 * - upsert batch capped at 1000 (we chunk at 500)
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "./utils";
import {
  SemanticSearchRequestSchema,
  SEMANTIC_SEARCH_CONFIG,
  type SemanticSearchFilters,
  type SemanticSearchResponse,
} from "../lib/search/types";
import {
  isSemanticSearchAvailable,
  semanticSearchDeals,
} from "../lib/search/client";
import { sanitizeFtsQuery, fuseHybridResults } from "../lib/search/hybrid";
import { searchDeals } from "../lib/d1/search";
import { logger } from "../lib/global-logger";
import {
  logAIInteraction,
  SEMANTIC_SEARCH_COMPLIANCE_OPERATION,
} from "../lib/research-agent/compliance-log";

/** Workers AI embedding model used for query vectorization. */
const SEMANTIC_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

/** Bucket size (5 minutes) used when synthesizing created_at vector metadata. */
const CREATED_AT_BUCKET_MS = 5 * 60 * 1000;

export function matchesSemanticFilters(
  metadata: Record<string, unknown> | undefined,
  filters: SemanticSearchFilters | undefined,
): boolean {
  if (!filters) return true;
  if (filters.domain !== undefined) {
    const domain = typeof metadata?.domain === "string" ? metadata.domain : "";
    if (domain.toLowerCase() !== filters.domain.toLowerCase()) return false;
  }
  if (filters.category !== undefined) {
    const categories = Array.isArray(metadata?.category)
      ? (metadata.category as unknown[])
      : [];
    const wanted = filters.category.toLowerCase();
    const hasCategory = categories.some(
      (c) => typeof c === "string" && c.toLowerCase() === wanted,
    );
    if (!hasCategory) return false;
  }
  if (filters.status !== undefined && filters.status !== "all") {
    if (metadata?.status !== filters.status) return false;
  }
  if (filters.tags !== undefined && filters.tags.length > 0) {
    const tags = Array.isArray(metadata?.tags)
      ? (metadata.tags as unknown[])
      : [];
    const normalizedTags = new Set(
      tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase()),
    );
    const wantsAll = filters.tags.every((t) =>
      normalizedTags.has(t.toLowerCase()),
    );
    if (!wantsAll) return false;
  }
  // min_reward has no vector-metadata value field. It is enforced separately
  // from the D1 reward_value column: hybrid search filters FTS rows against
  // it, and the pure vector path rejects min_reward requests (no D1 values).
  return true;
}

export function describeSemanticFilters(
  filters: SemanticSearchFilters | undefined,
): string[] {
  if (!filters) return [];
  const applied: string[] = [];
  if (filters.domain !== undefined) applied.push(`domain=${filters.domain}`);
  if (filters.category !== undefined)
    applied.push(`category=${filters.category}`);
  if (filters.status !== undefined) applied.push(`status=${filters.status}`);
  if (filters.tags !== undefined && filters.tags.length > 0)
    applied.push(`tags=${filters.tags.join(",")}`);
  if (filters.min_reward !== undefined)
    applied.push(`min_reward=${filters.min_reward}`);
  return applied;
}

export async function handleSemanticSearch(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }
  if (!isSemanticSearchAvailable(env)) {
    return errorResponse(
      "Semantic search unavailable: AI or DEAL_EMBEDDINGS binding not configured",
      503,
    );
  }

  const start = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = SemanticSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      `Invalid request: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      400,
    );
  }

  const { query, limit, filters, hybrid, min_score } = parsed.data;

  // min_reward is a structured D1 attribute that vector metadata does not
  // carry. Enforcing it requires D1 rows (hybrid), so reject vector-only.
  if (filters?.min_reward !== undefined && hybrid !== true) {
    return errorResponse(
      "min_reward filter requires hybrid=true; pure vector search returns no reward values",
      400,
    );
  }

  const requestedLimit = limit ?? SEMANTIC_SEARCH_CONFIG.DEFAULT_LIMIT;
  const namespace =
    env.ENVIRONMENT === "production"
      ? SEMANTIC_SEARCH_CONFIG.PRODUCTION_NAMESPACE
      : SEMANTIC_SEARCH_CONFIG.STAGING_NAMESPACE;

  try {
    // Hybrid path: run FTS5 + vector in parallel then RRF fuse
    if (hybrid === true) {
      return handleHybridSearch(
        env,
        query,
        requestedLimit,
        min_score,
        namespace,
        start,
        filters,
      );
    }

    const embeddingStart = Date.now();
    const hits = await semanticSearchDeals(env, {
      query,
      limit: requestedLimit,
      namespace,
    });
    const embeddingMs = Date.now() - embeddingStart;
    const vectorizeStart = Date.now();
    const filtered = hits.filter(
      (h) =>
        h.score >= min_score && matchesSemanticFilters(h.metadata, filters),
    );
    const vectorizeMs = Date.now() - vectorizeStart;

    // Article 12 record-keeping for the embedding + vector query. The raw
    // query text is hashed, never stored verbatim (data minimization).
    await logAIInteraction(env.DEALS_DB, {
      operation: SEMANTIC_SEARCH_COMPLIANCE_OPERATION,
      inputSource: "semantic_search_route",
      rawInput: query,
      inputDescription: `embedding_vector_lookup;model=${SEMANTIC_EMBEDDING_MODEL}`,
      inputMetadata: {
        model: SEMANTIC_EMBEDDING_MODEL,
        namespace: namespace ?? null,
        requested_limit: requestedLimit,
        hit_count: hits.length,
        returned_count: filtered.length,
      },
      result: `matches:${filtered.length}`,
      confidence: filtered[0]?.score,
      explanation: "Workers AI embedding queried against Vectorize index",
      latencyMs: embeddingMs,
    });

    const response: SemanticSearchResponse = {
      success: true,
      query,
      results: filtered.map((h) => ({
        deal: h.metadata as unknown as import("../lib/search/types").DealEmbeddingMetadata,
        score: h.score,
        match_type: "semantic",
      })),
      meta: {
        total: filtered.length,
        returned: filtered.length,
        execution_time_ms: Date.now() - start,
        embedding_time_ms: embeddingMs,
        vectorize_time_ms: vectorizeMs,
        model: SEMANTIC_EMBEDDING_MODEL,
        index_name: SEMANTIC_SEARCH_CONFIG.INDEX_NAME,
        filters_applied: [
          ...(namespace ? [`namespace=${namespace}`] : []),
          ...describeSemanticFilters(filters),
        ],
      },
    };
    return jsonResponse(response);
  } catch (err) {
    logger.error("Semantic search failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse("Semantic search failed", 500);
  }
}

async function handleHybridSearch(
  env: Env,
  query: string,
  requestedLimit: number,
  minScore: number,
  namespace: string | undefined,
  start: number,
  filters?: SemanticSearchFilters,
): Promise<Response> {
  const hybridStart = Date.now();
  const ftsQuery = sanitizeFtsQuery(query);

  // Run both searches in parallel; gracefully degrade if one fails.
  const [vectorResult, ftsResult] = await Promise.all([
    semanticSearchDeals(env, { query, limit: requestedLimit, namespace })
      .then((hits) => ({ ok: true as const, hits }))
      .catch((err) => {
        logger.warn("Hybrid vector search failed, continuing with FTS only", {
          error: err instanceof Error ? err.message : String(err),
        });
        return { ok: false as const, hits: [] as never[] };
      }),
    ftsQuery && env.DEALS_DB
      ? searchDeals(env.DEALS_DB, ftsQuery, { limit: requestedLimit })
          .then((rows) => ({ ok: true as const, rows }))
          .catch((err) => {
            logger.warn(
              "Hybrid FTS search failed, continuing with vector only",
              {
                error: err instanceof Error ? err.message : String(err),
              },
            );
            return { ok: false as const, rows: [] as never[] };
          })
      : Promise.resolve({ ok: false as const, rows: [] as never[] }),
  ]);

  const vectorHits = vectorResult.ok
    ? vectorResult.hits.filter((h) =>
        matchesSemanticFilters(h.metadata, filters),
      )
    : [];
  const rawFtsRows = (ftsResult as { rows?: unknown[] }).rows
    ? (
        ftsResult as {
          ok: boolean;
          rows: import("../lib/d1/types").DealSearchResult[];
        }
      ).rows
    : [];
  const minReward = filters?.min_reward;

  // min_reward is a structured D1 attribute that vector metadata does not
  // carry, so it is enforced from the FTS rows' D1 reward_value before fusion.
  const rewardEligibleRows =
    minReward !== undefined
      ? rawFtsRows.filter(
          (row) =>
            typeof row.reward_value === "number" &&
            row.reward_value >= minReward,
        )
      : rawFtsRows;

  const ftsRows = filters
    ? rewardEligibleRows.filter((row) =>
        matchesSemanticFilters(
          {
            domain: row.domain,
            category: row.category,
            status: row.status,
            tags: row.tags,
          },
          filters,
        ),
      )
    : rewardEligibleRows;

  // When a reward floor is set, only deals verified against D1 (present in the
  // reward-eligible FTS rows) may be returned; unverifiable vector hits drop.
  const rewardEligibleIds =
    minReward !== undefined
      ? new Set(rewardEligibleRows.map((row) => row.deal_id))
      : undefined;
  const fusionVectorHits =
    rewardEligibleIds !== undefined
      ? vectorHits.filter((h) => {
          const dealId =
            typeof h.metadata?.deal_id === "string" ? h.metadata.deal_id : h.id;
          return rewardEligibleIds.has(dealId);
        })
      : vectorHits;

  // If both empty but one side expected to have results, fallback to whichever succeeded
  const fusionStart = Date.now();

  let results: SemanticSearchResponse["results"] = [];
  let totalFused = 0;

  if (ftsQuery && ftsRows.length > 0) {
    const fused = fuseHybridResults(fusionVectorHits, ftsRows, {
      limit: requestedLimit,
      minScore,
    });
    totalFused = fused.length;
    results = fused.map((f) => ({
      deal: (f.metadata as import("../lib/search/types").DealEmbeddingMetadata) ?? {
        deal_id: f.deal_id,
        domain: f.domain ?? "unknown",
        category: [],
        tags: [],
        status: "active",
        reward_type: "cash",
        created_at_bucket:
          Math.floor(Date.now() / CREATED_AT_BUCKET_MS) * CREATED_AT_BUCKET_MS,
      },
      score: f.score,
      match_type: f.match_type,
    }));
  } else {
    // No FTS results or query not FTS-able: vector only filtered
    const filtered = fusionVectorHits
      .filter((h) => h.score >= minScore)
      .slice(0, requestedLimit);
    totalFused = filtered.length;
    results = filtered.map((h) => ({
      deal: h.metadata as unknown as import("../lib/search/types").DealEmbeddingMetadata,
      score: h.score,
      match_type: "semantic" as const,
    }));
  }

  const fusionMs = Date.now() - fusionStart;
  const totalMs = Date.now() - hybridStart;

  // Compliance log for hybrid path (hashes query)
  try {
    await logAIInteraction(env.DEALS_DB, {
      operation: SEMANTIC_SEARCH_COMPLIANCE_OPERATION,
      inputSource: "semantic_search_route_hybrid",
      rawInput: query,
      inputDescription: `hybrid_fts_vector;model=${SEMANTIC_EMBEDDING_MODEL};fts_q=${ftsQuery}`,
      inputMetadata: {
        model: SEMANTIC_EMBEDDING_MODEL,
        namespace: namespace ?? null,
        requested_limit: requestedLimit,
        vector_hit_count: vectorHits.length,
        fts_hit_count: ftsRows.length,
        returned_count: results.length,
        hybrid: true,
      },
      result: `matches:${results.length}`,
      confidence: results[0]?.score,
      explanation:
        "RRF fusion of Vectorize semantic scores and D1 FTS5 BM25 ranks",
      latencyMs: totalMs,
    });
  } catch {
    // best-effort compliance logging
  }

  const response: SemanticSearchResponse = {
    success: true,
    query,
    results,
    meta: {
      total: totalFused,
      returned: results.length,
      execution_time_ms: Date.now() - start,
      embedding_time_ms: totalMs - fusionMs,
      vectorize_time_ms: fusionMs,
      model: SEMANTIC_EMBEDDING_MODEL,
      index_name: SEMANTIC_SEARCH_CONFIG.INDEX_NAME,
      filters_applied: [
        ...(namespace ? [`namespace=${namespace}`] : []),
        "hybrid=rrf",
        `fts_query=${ftsQuery || "n/a"}`,
        ...describeSemanticFilters(filters),
      ],
    },
  };
  return jsonResponse(response);
}
