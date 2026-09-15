import type { Env } from "../types";
import type {
  ShadowSampleKey,
  ShadowSourceSummary,
} from "../pipeline/discover";
import {
  buildFingerprintKey,
  buildUrlCacheKey,
  normalizeUrl,
} from "../lib/validation-cache/key";
import { ValidationCacheRepository } from "../lib/validation-cache/repository";
import { ValidationIndexRepository } from "../lib/validation-cache/index-repository";
import { logger } from "../lib/global-logger";

/**
 * Keys per validate-batch step. Scalar-only payloads keep durable step
 * returns far under the 1 MiB limit.
 */
export const SHADOW_VALIDATE_BATCH_SIZE = 50;

/**
 * Compact dry-run outcome for one validate batch. No decisions are
 * persisted; counts only.
 */
export interface ValidateBatchSummary {
  batch_index: number;
  checked: number;
  hits: number;
  misses: number;
  by_source: Record<string, number>;
}

/**
 * Aggregate validate outcome across all batches of a shadow run.
 */
export interface ShadowValidateSummary {
  batches: number;
  checked: number;
  hits: number;
  misses: number;
  batch_errors: number;
}

/**
 * Deterministic durable step name. Index plus run id form a stable cache
 * key (Rules of Workflows: no Date.now/random in names).
 */
export function validateBatchStepName(index: number, run_id: string): string {
  return `validate-batch-${index}-${run_id}`;
}

/**
 * Group shadow sample keys into deterministic batches, preserving source
 * order so runs are reproducible.
 */
export function chunkShadowKeys(
  summaries: ShadowSourceSummary[],
  batchSize: number = SHADOW_VALIDATE_BATCH_SIZE,
): ShadowSampleKey[][] {
  const keys: ShadowSampleKey[] = [];
  for (const summary of summaries) {
    for (const key of summary.sample_keys ?? []) {
      keys.push(key);
    }
  }
  const batches: ShadowSampleKey[][] = [];
  for (let i = 0; i < keys.length; i += batchSize) {
    batches.push(keys.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Dry-run fast-path validation for one batch of shadow-discovered deals.
 * Read-only by construction: mirrors the hit/miss decisions of
 * `validateDealFastPath` (KV fingerprint-duplicate, KV url
 * accepted/rejected, D1 index row) via gets/selects only. It never invokes
 * the `persist` callback and never repopulates the KV cache from D1, so no
 * KV puts, D1 writes, tally flushes, or breaker writes occur.
 * Cache hits/misses mirror what the main path would decide.
 */
export async function validateBatchReadonly(
  env: Env,
  batch_index: number,
  keys: ShadowSampleKey[],
): Promise<ValidateBatchSummary> {
  let hits = 0;
  const by_source: Record<string, number> = {};
  const kv = env.DEALS_STAGING;
  const db = env.DEALS_DB;
  if (kv && db) {
    const cacheRepo = new ValidationCacheRepository(kv);
    const indexRepo = new ValidationIndexRepository(db);
    for (const key of keys) {
      const normalizedUrl = normalizeUrl(key.url);
      const [urlKey, fpKey] = await Promise.all([
        buildUrlCacheKey(normalizedUrl),
        buildFingerprintKey(key.fingerprint),
      ]);
      const [cachedByUrl, cachedByFingerprint, indexedByFingerprint] =
        await Promise.all([
          cacheRepo.get(urlKey),
          cacheRepo.get(fpKey),
          indexRepo.findByFingerprint(key.fingerprint),
        ]);
      if (
        cachedByFingerprint?.status === "duplicate" ||
        cachedByUrl?.status === "accepted" ||
        cachedByUrl?.status === "rejected" ||
        indexedByFingerprint
      ) {
        hits += 1;
      }
      const host = hostOf(key.url);
      by_source[host] = (by_source[host] ?? 0) + 1;
    }
  } else {
    for (const key of keys) {
      const host = hostOf(key.url);
      by_source[host] = (by_source[host] ?? 0) + 1;
    }
  }

  logger.info("Shadow validate batch completed", {
    component: "workflow-shadow",
    batch_index,
    checked: keys.length,
    hits,
  });

  return {
    batch_index,
    checked: keys.length,
    hits,
    misses: keys.length - hits,
    by_source,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}
