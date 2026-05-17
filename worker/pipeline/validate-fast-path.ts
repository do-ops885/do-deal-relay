// worker/pipeline/validate-fast-path.ts
import type { Env, PipelineMetrics } from "../types";
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

/**
 * Runtime type guard for PipelineMetrics. Since `metrics` is typed as `unknown`,
 * we validate the shape before casting, providing runtime safety beyond the
 * TypeScript compiler's static analysis.
 */
function isPipelineMetrics(value: unknown): value is PipelineMetrics {
  return (
    typeof value === "object" &&
    value !== null &&
    "run_id" in value &&
    typeof (value as Record<string, unknown>).run_id === "string" &&
    "start_time" in value &&
    typeof (value as Record<string, unknown>).start_time === "number" &&
    "success" in value &&
    typeof (value as Record<string, unknown>).success === "boolean"
  );
}

/**
 * Result of the fast-path validation phase.
 * @property valid - Whether the deal passed fast-path validation
 * @property error - Error message if validation failed
 * @property metrics - Optional metrics captured during validation
 */
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
    metrics?: unknown;
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
    if (isPipelineMetrics(input.metrics)) {
      recordValidationCacheMetric(input.metrics, "hit_total", 1);
      recordValidationCacheMetric(input.metrics, "dedup_hit_total", 1);
    }
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
    if (isPipelineMetrics(input.metrics)) {
      recordValidationCacheMetric(input.metrics, "hit_total", 1);
    }
    return { hit: true, source: "kv:url", decision: cachedByUrl };
  }

  if (isPipelineMetrics(input.metrics)) {
    recordValidationCacheMetric(input.metrics, "miss_total", 1);
  }

  if (indexedByFingerprint) {
    if (isPipelineMetrics(input.metrics)) {
      recordValidationCacheMetric(input.metrics, "d1_lookup_total", 1);
    }
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
      if (isPipelineMetrics(input.metrics)) {
        recordValidationCacheMetric(input.metrics, "write_total", 1);
      }
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
