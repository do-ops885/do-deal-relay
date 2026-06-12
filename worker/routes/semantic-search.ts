/**
 * Semantic Search HTTP Route
 *
 * Exposes /api/semantic-search for natural-language queries over deals.
 * Uses Cloudflare Vectorize + Workers AI for embeddings.
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
  type SemanticSearchResponse,
} from "../lib/search/types";
import {
  isSemanticSearchAvailable,
  semanticSearchDeals,
} from "../lib/search/client";
import { logger } from "../lib/global-logger";

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

  const {
    query,
    limit,
    filters: _filters,
    hybrid: _hybrid,
    min_score,
  } = parsed.data;
  const requestedLimit = limit ?? SEMANTIC_SEARCH_CONFIG.DEFAULT_LIMIT;
  const namespace =
    env.ENVIRONMENT === "production"
      ? SEMANTIC_SEARCH_CONFIG.PRODUCTION_NAMESPACE
      : SEMANTIC_SEARCH_CONFIG.STAGING_NAMESPACE;

  try {
    const embeddingStart = Date.now();
    const hits = await semanticSearchDeals(env, {
      query,
      limit: requestedLimit,
      namespace,
    });
    const embeddingMs = Date.now() - embeddingStart;
    const vectorizeStart = Date.now();
    const filtered = hits.filter((h) => h.score >= min_score);
    const vectorizeMs = Date.now() - vectorizeStart;

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
        model: "@cf/baai/bge-base-en-v1.5",
        index_name: SEMANTIC_SEARCH_CONFIG.INDEX_NAME,
        filters_applied: namespace ? [`namespace=${namespace}`] : [],
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
