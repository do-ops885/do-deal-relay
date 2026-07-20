import { Deal, SourceConfig, PipelineContext } from "../types";
import type { Env } from "../types";
import { CONFIG } from "../config";
import { getSourceRegistry, recordSourceValidation } from "../lib/storage";
import { logger } from "../lib/global-logger";
import { getTrustThreshold } from "../lib/config-utils";
import { createTimeoutSignal } from "../lib/utils";
import { validatedFetch } from "../lib/security";
import {
  parseHTMLContent,
  parseJSONContent,
  buildDeal,
} from "./discover-parsers";
import { calculateAdaptiveBudget } from "./discovery-budget";

// ============================================================================
// Discovery Engine
// ============================================================================

interface DiscoveryResult {
  deals: Deal[];
  errors: Array<{ url: string; error: string }>;
}

interface ExtractedDeal {
  code: string;
  url: string;
  title: string;
  description: string;
  reward_type: string;
  reward_value: string | number;
  reward_currency?: string;
  expiry_date?: string;
}

/**
 * Run discovery across all configured sources
 */
export async function discover(
  env: Env,
  ctx: PipelineContext,
): Promise<DiscoveryResult> {
  const sources = await getSourceRegistry(env);
  let activeSources = sources.filter((s) => s.active);

  if (activeSources.length === 0) {
    logger.warn("No active sources configured", { component: "discovery" });
    return { deals: [], errors: [] };
  }

  // Budget configuration
  const globalBudget = parseInt(
    env.CANDIDATE_BUDGET_GLOBAL || String(CONFIG.MAX_DEALS_PER_RUN),
    10,
  );
  const perSourceBase = parseInt(env.CANDIDATE_BUDGET_PER_SOURCE || "100", 10);
  const highTrustBonus = parseInt(
    env.CANDIDATE_BUDGET_HIGH_TRUST_BONUS || "200",
    10,
  );

  const trustThreshold = getTrustThreshold(env);

  // Filter sources by trust threshold
  activeSources = activeSources.filter((s) => {
    if (s.classification === "blocked") return false;
    if (s.trust_initial < trustThreshold) {
      logger.info(`Skipping source ${s.domain} - trust below threshold`, {
        component: "discovery",
        trust: s.trust_initial,
        threshold: trustThreshold,
      });
      return false;
    }
    return true;
  });

  // Sort sources by trust score descending
  activeSources.sort((a, b) => b.trust_initial - a.trust_initial);

  const deals: Deal[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  logger.info("Starting discovery with budget constraints", {
    component: "discovery",
    globalBudget,
    sourceCount: activeSources.length,
  });

  for (const source of activeSources) {
    const remainingGlobal = globalBudget - deals.length;

    if (remainingGlobal <= 0) {
      logger.info("Global discovery budget exhausted", {
        component: "discovery",
        dealsFound: deals.length,
      });
      break;
    }

    // Calculate adaptive per-source budget
    const sourceBudget = calculateAdaptiveBudget(
      source,
      perSourceBase,
      highTrustBonus,
    );
    const effectiveLimit = Math.min(sourceBudget, remainingGlobal);

    logger.info(`Allocating budget for ${source.domain}`, {
      component: "discovery",
      trust: source.trust_initial,
      budget: effectiveLimit,
      adaptiveBudget: sourceBudget,
      validationSuccessRate:
        source.validation_success_count && source.validation_failure_count
          ? source.validation_success_count /
            (source.validation_success_count + source.validation_failure_count)
          : "N/A",
      discoveryCount: source.discovery_count || 0,
      remainingGlobal,
    });

    try {
      const result = await discoverFromSource(env, source, effectiveLimit);
      deals.push(...result.deals);
      errors.push(...result.errors);

      // Update source discovery count
      source.discovery_count = (source.discovery_count || 0) + 1;
      source.last_discovery = new Date().toISOString();
    } catch (error) {
      errors.push({
        url: source.domain,
        error: (error as Error).message,
      });
    }
  }

  // Fast pre-filter: cheap checks before expensive validation
  const seenUrls = new Set<string>();
  const filtered = deals.filter((deal) => {
    // Well-formedness: required fields
    if (!deal.code || !deal.url || !deal.title) return false;

    // Trust threshold pre-filter
    if (deal.source.trust_score < trustThreshold) return false;

    // In-batch dedup by URL
    if (seenUrls.has(deal.url)) return false;
    seenUrls.add(deal.url);

    return true;
  });

  return { deals: filtered, errors };
}

/**
 * Discover deals from a single source
 * Fetches URL patterns in parallel with configurable concurrency for performance.
 */
async function discoverFromSource(
  env: Env,
  source: SourceConfig,
  limit: number,
): Promise<DiscoveryResult> {
  const deals: Deal[] = [];
  const errors: Array<{ url: string; error: string }> = []; // Process URL patterns in parallel with a concurrency limit.
  // Uses sequential batch iteration to avoid race conditions on the limit check,
  // while fetching within each batch in parallel. After each batch, the total
  // is truncated if it exceeded the limit (due to concurrent fulfillment).
  const CONCURRENCY = 3;
  let batchIndex = 0;
  while (batchIndex < source.url_patterns.length && deals.length < limit) {
    const batch = source.url_patterns.slice(
      batchIndex,
      batchIndex + CONCURRENCY,
    );
    batchIndex += CONCURRENCY;

    const results = await Promise.allSettled(
      batch.map(async (pattern) => {
        try {
          const url = `https://${source.domain}${pattern}`;

          const { signal, cleanup } = createTimeoutSignal(
            CONFIG.FETCH_TIMEOUT_MS,
          );
          let response;
          try {
            response = await validatedFetch(url, {
              method: "GET",
              headers: {
                "User-Agent":
                  "DealDiscoveryBot/1.0 (AI Agent; Autonomous Discovery)",
                Accept: "text/html,application/json",
              },
              signal,
            });
          } finally {
            cleanup();
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const contentType = response.headers.get("content-type") || "";
          const contentLength = response.headers.get("content-length");
          const maxSize = CONFIG.MAX_PAYLOAD_SIZE_BYTES;

          let content: string;
          if (contentLength && parseInt(contentLength, 10) > maxSize) {
            throw new Error(
              `Payload exceeds size limit: ${contentLength} bytes (max: ${maxSize})`,
            );
          } else {
            content = await response.text();
          }

          if (content.length > maxSize) {
            throw new Error("Payload exceeds size limit");
          }

          const extracted: ExtractedDeal[] = contentType.includes(
            "application/json",
          )
            ? parseJSONContent(content, source)
            : parseHTMLContent(content, source);

          const patternDeals: Deal[] = [];
          const patternErrors: Array<{ url: string; error: string }> = [];

          for (const item of extracted) {
            try {
              const deal = await buildDeal(item, source);
              patternDeals.push(deal);
            } catch (error) {
              patternErrors.push({
                url: item.url,
                error: `Build failed: ${(error as Error).message}`,
              });
            }
          }

          await recordSourceValidation(env, source.domain, true);
          return { patternDeals, patternErrors };
        } catch (error) {
          await recordSourceValidation(env, source.domain, false);
          return {
            patternDeals: [],
            patternErrors: [
              {
                url: `${source.domain}${pattern}`,
                error: (error as Error).message,
              },
            ],
          };
        }
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        deals.push(...result.value.patternDeals);
        errors.push(...result.value.patternErrors);
      } else {
        errors.push({
          url: source.domain,
          error: result.reason?.message || "Unknown error in parallel fetch",
        });
      }
    }

    // Truncate if we exceeded the limit due to concurrent fulfillment
    if (deals.length > limit) {
      deals.length = limit;
    }
  }

  return { deals, errors };
}
