/**
 * Hybrid Search Fusion
 *
 * Combines FTS5 keyword search and vector semantic search using
 * Reciprocal Rank Fusion (RRF) and optional weighted sum.
 *
 * RRF is preferred because raw scores are not comparable:
 * - vector cosine: 0..1
 * - FTS rank: negative BM25 (lower is better)
 * Fusion via ranks normalises both signals.
 *
 * @module worker/lib/search/hybrid
 */

import type { SemanticSearchHit } from "./client";
import type { DealSearchResult } from "../d1/types";
import type { DealEmbeddingMetadata } from "./types";

const DEFAULT_RRF_K = 60;
const DEFAULT_VECTOR_WEIGHT = 0.6;
const DEFAULT_FTS_WEIGHT = 0.4;

export interface HybridFusionOptions {
  rrfK?: number;
  vectorWeight?: number;
  ftsWeight?: number;
  limit?: number;
  minScore?: number;
}

export interface HybridSearchResult {
  id: string;
  deal_id: string;
  score: number;
  match_type: "semantic" | "hybrid" | "keyword";
  metadata?: DealEmbeddingMetadata;
  vector_rank?: number;
  fts_rank?: number;
  vector_score?: number;
  fts_relevance?: number;
  title?: string;
  domain?: string;
}

/**
 * Sanitize a user query for FTS5 MATCH.
 * Removes FTS5 operators and balances quotes so the statement never throws.
 * Porter tokenizer is used, so lower-casing and trimming is applied.
 */
export function sanitizeFtsQuery(raw: string): string {
  if (!raw) return "";
  // Remove FTS5 special chars: " * : ( ) ^ - + and control chars
  // Keep alphanumeric, spaces, and simple punctuation that tokenizer can handle.
  let q = raw.toLowerCase().trim().slice(0, 500);
  q = q.replace(/["'*:\^()\-+]/g, " ");
  // Collapse whitespace
  q = q.replace(/\s+/g, " ").trim();
  if (!q) return "";
  // Tokenize into terms, drop very short terms (<2 chars) except for ports?
  const terms = q
    .split(" ")
    .filter((t) => t.length >= 2)
    .slice(0, 10);
  if (terms.length === 0) return "";
  // Join with OR for recall; FTS5 MATCH supports OR. Escaping via quoted terms.
  // Using OR gives broader matches suitable for fusion re-ranking.
  // If only one term, no OR needed.
  if (terms.length === 1) return terms[0] as string;
  return terms.join(" OR ");
}

/**
 * Reciprocal Rank Fusion score for a single rank.
 */
export function rrfScore(rank: number, k: number = DEFAULT_RRF_K): number {
  return 1 / (k + rank);
}

/**
 * Convert a DealSearchResult (FTS) into DealEmbeddingMetadata-ish shape
 * used by the semantic search response.
 */
export function ftsRowToMetadata(row: DealSearchResult): DealEmbeddingMetadata {
  const category = Array.isArray(row.category)
    ? row.category
    : typeof row.category === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(row.category as unknown as string);
            return Array.isArray(parsed) ? parsed : [row.category];
          } catch {
            return row.category ? [row.category] : [];
          }
        })()
      : [];
  const tags = Array.isArray(row.tags)
    ? row.tags
    : typeof row.tags === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(row.tags as unknown as string);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  const createdAtBucket = Math.floor(Date.now() / 300000) * 300000;
  return {
    deal_id: row.deal_id,
    domain: row.domain,
    category,
    tags,
    status: (row.status as DealEmbeddingMetadata["status"]) || "active",
    reward_type:
      (row.reward_type as DealEmbeddingMetadata["reward_type"]) || "cash",
    created_at_bucket: createdAtBucket,
  };
}

/**
 * Fuse vector and FTS result sets via RRF.
 *
 * Steps:
 * 1. Build rank maps (1-indexed by score order for vector, by relevance order for FTS).
 * 2. Union all ids.
 * 3. Compute fused score = w_vector * rrf(vector_rank) + w_fts * rrf(fts_rank).
 * 4. Sort by fused score desc, slice to limit, attach metadata and match_type.
 */
export function fuseHybridResults(
  vectorHits: SemanticSearchHit[],
  ftsResults: DealSearchResult[],
  options: HybridFusionOptions = {},
): HybridSearchResult[] {
  const rrfK = options.rrfK ?? DEFAULT_RRF_K;
  const vectorWeight = options.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
  const ftsWeight = options.ftsWeight ?? DEFAULT_FTS_WEIGHT;
  const limit = options.limit ?? 20;
  const minScore = options.minScore ?? 0;

  const vectorRankMap = new Map<
    string,
    { rank: number; hit: SemanticSearchHit }
  >();
  vectorHits.forEach((hit, idx) => {
    const rank = idx + 1;
    vectorRankMap.set(hit.id, { rank, hit });
    // Also allow matching by deal_id if available in metadata
    const metaDealId = (hit.metadata as Record<string, unknown> | undefined)
      ?.deal_id;
    if (typeof metaDealId === "string" && metaDealId !== hit.id) {
      if (!vectorRankMap.has(metaDealId)) {
        vectorRankMap.set(metaDealId, { rank, hit });
      }
    }
  });

  const ftsRankMap = new Map<string, { rank: number; row: DealSearchResult }>();
  ftsResults.forEach((row, idx) => {
    const rank = idx + 1;
    ftsRankMap.set(row.deal_id, { rank, row });
  });

  const allIds = new Set<string>([
    ...vectorRankMap.keys(),
    ...ftsRankMap.keys(),
  ]);

  const fused: HybridSearchResult[] = [];

  for (const id of allIds) {
    const v = vectorRankMap.get(id);
    const f = ftsRankMap.get(id);

    const vRank = v ? v.rank : undefined;
    const fRank = f ? f.rank : undefined;

    const vScore = v ? rrfScore(vRank as number, rrfK) * vectorWeight : 0;
    const fScore = f ? rrfScore(fRank as number, rrfK) * ftsWeight : 0;
    const score = vScore + fScore;

    if (score < minScore) continue;

    let match_type: HybridSearchResult["match_type"] = "semantic";
    if (v && f) match_type = "hybrid";
    else if (f && !v) match_type = "keyword";

    // Prefer vector metadata when present, else synthesize from FTS row
    let metadata: DealEmbeddingMetadata | undefined;
    let title: string | undefined;
    let domain: string | undefined;

    if (v?.hit.metadata) {
      metadata = v.hit.metadata as unknown as DealEmbeddingMetadata;
      domain = metadata.domain;
    } else if (f) {
      metadata = ftsRowToMetadata(f.row);
      title = f.row.title;
      domain = f.row.domain;
    }

    // Enrich title/domain from FTS even when vector metadata exists, for UI convenience
    if (f && !title) title = f.row.title;
    if (f && !domain) domain = f.row.domain;

    // Canonical id: prefer deal_id
    const dealId =
      (metadata?.deal_id as string) || f?.row.deal_id || v?.hit.id || id;

    fused.push({
      id: dealId,
      deal_id: dealId,
      score,
      match_type,
      metadata,
      vector_rank: vRank,
      fts_rank: fRank,
      vector_score: v?.hit.score,
      fts_relevance: f?.row.relevance,
      title,
      domain,
    });
  }

  fused.sort((a, b) => b.score - a.score);
  return fused.slice(0, limit);
}

/**
 * Weighted sum fusion (alternative to RRF) – normalizes both scores to 0..1
 * then does linear combination. Kept for experimentation, not default.
 */
export function weightedSumFusion(
  vectorHits: SemanticSearchHit[],
  ftsResults: DealSearchResult[],
  options: HybridFusionOptions = {},
): HybridSearchResult[] {
  const limit = options.limit ?? 20;
  const vectorWeight = options.vectorWeight ?? 0.6;
  const ftsWeight = options.ftsWeight ?? 0.4;

  // Normalize FTS relevance: FTS rank is negative, more negative = better.
  // We convert to 0..1 by min-max within the result set.
  const relevances = ftsResults
    .map((r) => r.relevance)
    .filter((v): v is number => typeof v === "number");
  const minRel = relevances.length ? Math.min(...relevances) : 0;
  const maxRel = relevances.length ? Math.max(...relevances) : 0;
  const range = maxRel - minRel || 1;

  const vectorMap = new Map<string, SemanticSearchHit>();
  for (const h of vectorHits) vectorMap.set(h.id, h);

  const ftsMap = new Map<string, DealSearchResult>();
  for (const r of ftsResults) ftsMap.set(r.deal_id, r);

  const allIds = new Set<string>([...vectorMap.keys(), ...ftsMap.keys()]);
  const fused: HybridSearchResult[] = [];

  for (const id of allIds) {
    const v = vectorMap.get(id);
    const f = ftsMap.get(id);
    const normVector = v ? Math.max(0, Math.min(1, v.score)) : 0;
    let normFts = 0;
    if (f && typeof f.relevance === "number") {
      // Relevance is negative: smaller (more negative) = better. Invert.
      normFts = (maxRel - f.relevance) / range;
    }
    const score = normVector * vectorWeight + normFts * ftsWeight;
    if (score < (options.minScore ?? 0)) continue;
    let match_type: HybridSearchResult["match_type"] = "semantic";
    if (v && f) match_type = "hybrid";
    else if (f && !v) match_type = "keyword";
    const metadata = v?.metadata
      ? (v.metadata as unknown as DealEmbeddingMetadata)
      : f
        ? ftsRowToMetadata(f)
        : undefined;
    fused.push({
      id,
      deal_id: id,
      score,
      match_type,
      metadata,
      vector_score: v?.score,
      fts_relevance: f?.relevance,
      title: f?.title,
      domain: f?.domain,
    });
  }
  fused.sort((a, b) => b.score - a.score);
  return fused.slice(0, limit);
}
