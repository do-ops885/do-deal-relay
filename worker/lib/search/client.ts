/**
 * Semantic Search Client
 *
 * Minimal-viable semantic search over deals and referrals using
 * Cloudflare Vectorize for storage and Workers AI for embeddings.
 *
 * Constraints (Cloudflare Vectorize free tier):
 * - 100 indexes per account
 * - 1,000 namespaces per index
 * - 1,000 vectors per upsert batch
 * - 50 topK results with values/metadata
 *
 * @see https://developers.cloudflare.com/vectorize/get-started/intro/
 */

import type { Env } from "../../types";
import type { VectorizeVector } from "@cloudflare/workers-types";
import { SEMANTIC_SEARCH_CONFIG, type DealVector } from "./types";
import { logger } from "../global-logger";
import { isGatewayEnabled } from "../ai-gateway/llm";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const VECTORIZE_TOPK_MAX = 50;

type AiRunFn = (model: string, inputs: unknown) => Promise<unknown>;

function clampTopK(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return SEMANTIC_SEARCH_CONFIG.DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(limit), VECTORIZE_TOPK_MAX);
}

async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  if (!env.AI) {
    throw new Error("AI binding not available");
  }
  // If AI Gateway is configured, embeddings still go via Workers AI directly
  // but we log the routing decision for observability; gateway chat proxy is
  // handled in worker/lib/ai-gateway/llm.ts for LLM calls.
  if (isGatewayEnabled(env)) {
    logger.debug(
      "Embedding via Workers AI (gateway enabled, embeddings passthrough)",
      {
        model: EMBEDDING_MODEL,
        batch: texts.length,
      },
    );
  }
  const result = (await (env.AI.run as AiRunFn)(EMBEDDING_MODEL, {
    text: texts,
  })) as { data?: number[][] };
  if (!Array.isArray(result.data)) {
    throw new Error("AI embedding response missing data array");
  }
  return result.data;
}

export interface SemanticSearchHit {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SemanticSearchOptions {
  query: string;
  limit?: number;
  namespace?: string;
}

export function isSemanticSearchAvailable(env: Env): boolean {
  return Boolean(env.AI) && Boolean(env.DEAL_EMBEDDINGS);
}

export async function semanticSearchDeals(
  env: Env,
  options: SemanticSearchOptions,
): Promise<SemanticSearchHit[]> {
  if (!env.DEAL_EMBEDDINGS) {
    throw new Error("DEAL_EMBEDDINGS binding not configured");
  }
  const topK = clampTopK(options.limit ?? SEMANTIC_SEARCH_CONFIG.DEFAULT_LIMIT);
  const vectors = await embedTexts(env, [options.query]);
  const queryVector = vectors[0];
  if (!queryVector) {
    return [];
  }
  const results = await env.DEAL_EMBEDDINGS.query(queryVector, {
    topK,
    namespace: options.namespace,
    returnMetadata: "all",
  });
  return results.matches.map((m) => ({
    id: m.id,
    score: m.score,
    metadata: m.metadata as Record<string, unknown> | undefined,
  }));
}

export async function upsertDealVectors(
  env: Env,
  vectors: DealVector[],
  namespace?: string,
): Promise<number> {
  if (!env.DEAL_EMBEDDINGS) {
    throw new Error("DEAL_EMBEDDINGS binding not configured");
  }
  if (vectors.length === 0) {
    return 0;
  }
  // Free tier: 1,000 vectors per upsert batch. We chunk defensively at 500.
  // Namespace is per-vector in the Vectorize API.
  const CHUNK = 500;
  const stamped: VectorizeVector[] = vectors.map((v) => ({
    id: v.id,
    values: v.values,
    namespace: namespace ?? v.namespace,
    metadata: v.metadata as unknown as Record<string, never>,
  }));
  let inserted = 0;
  for (let i = 0; i < stamped.length; i += CHUNK) {
    const slice = stamped.slice(i, i + CHUNK);
    await env.DEAL_EMBEDDINGS.upsert(slice);
    inserted += slice.length;
  }
  return inserted;
}
