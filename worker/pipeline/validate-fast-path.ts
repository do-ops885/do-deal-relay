// worker/pipeline/validate-fast-path.ts
import type { Env } from "../types";
import {
  buildFingerprintKey,
  buildUrlCacheKey,
  normalizeUrl,
} from "../lib/validation-cache/key";
import {
  ValidationCacheRepository,
  ttlForStatus,
} from "../lib/validation-cache/repository";
import { ValidationIndexRepository } from "../lib/validation-cache/index-repository";
import type { ValidationCacheEntry } from "../types/validation-cache";
import { recordValidationCacheMetric } from "../lib/metrics";

export interface FastPathResult {
  hit: boolean;
  source: "kv:url" | "kv:fingerprint" | "d1" | "none";
  decision?: ValidationCacheEntry;
  persist?: (decision: {
    status: "accepted" | "duplicate" | "rejected" | "transient_error";
    reason?: string;
    trustScore?: number;
  }) => Promise<void>;
}

export async function validateDealFastPath(
  env: Env,
  input: {
    url: string;
    fingerprint: string;
    source?: string;
    traceId?: string;
    metrics?: any;
  },
): Promise<FastPathResult> {
  // Use STAGING_KV for validation cache as proposed, or fallback to DEALS_LOG if STAGING_KV is not ideal
  // Given DEALS_STAGING is available in Env, let's use that.
  const kv = env.DEALS_STAGING;
  const db = env.DEALS_DB;

  if (!kv || !db) {
    return { hit: false, source: "none" };
  }

  const cacheRepo = new ValidationCacheRepository(kv);
  const indexRepo = new ValidationIndexRepository(db);

  const normalizedUrl = normalizeUrl(input.url);
  const urlKey = await buildUrlCacheKey(normalizedUrl);
  const fpKey = await buildFingerprintKey(input.fingerprint);

  const [cachedByUrl, cachedByFingerprint, indexedByFingerprint] =
    await Promise.all([
      cacheRepo.get(urlKey),
      cacheRepo.get(fpKey),
      indexRepo.findByFingerprint(input.fingerprint),
    ]);

  if (cachedByFingerprint?.status === "duplicate") {
    if (input.metrics)
      recordValidationCacheMetric(input.metrics, "hit_total", 1);
    if (input.metrics)
      recordValidationCacheMetric(input.metrics, "dedup_hit_total", 1);
    return {
      hit: true,
      source: "kv:fingerprint",
      decision: cachedByFingerprint,
    };
  }

  if (
    cachedByUrl?.status === "accepted" ||
    cachedByUrl?.status === "rejected"
  ) {
    if (input.metrics)
      recordValidationCacheMetric(input.metrics, "hit_total", 1);
    return { hit: true, source: "kv:url", decision: cachedByUrl };
  }

  if (input.metrics)
    recordValidationCacheMetric(input.metrics, "miss_total", 1);

  if (indexedByFingerprint) {
    if (input.metrics)
      recordValidationCacheMetric(input.metrics, "d1_lookup_total", 1);
    const entry: ValidationCacheEntry = {
      status: indexedByFingerprint.status,
      reason: indexedByFingerprint.reason ?? undefined,
      trustScore: indexedByFingerprint.trust_score ?? undefined,
      fingerprint: indexedByFingerprint.fingerprint,
      normalizedUrl: indexedByFingerprint.normalized_url,
      source: indexedByFingerprint.source ?? undefined,
      traceId: indexedByFingerprint.trace_id ?? undefined,
      createdAt: new Date().toISOString(),
    };

    // Re-populate KV cache from D1
    await Promise.all([
      cacheRepo.put(fpKey, entry, ttlForStatus(entry.status)),
      cacheRepo.put(urlKey, entry, ttlForStatus(entry.status)),
    ]);

    return { hit: true, source: "d1", decision: entry };
  }

  return {
    hit: false,
    source: "none",
    persist: async (decision) => {
      if (input.metrics)
        recordValidationCacheMetric(input.metrics, "write_total", 1);
      const entry: ValidationCacheEntry = {
        ...decision,
        fingerprint: input.fingerprint,
        normalizedUrl,
        source: input.source,
        traceId: input.traceId,
        createdAt: new Date().toISOString(),
      };

      await Promise.all([
        cacheRepo.put(fpKey, entry, ttlForStatus(entry.status)),
        cacheRepo.put(urlKey, entry, ttlForStatus(entry.status)),
        indexRepo.upsert(entry),
      ]);
    },
  };
}
