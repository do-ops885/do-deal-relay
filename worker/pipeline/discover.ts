import { Deal, SourceConfig, PipelineContext } from "../types";
import type { Env } from "../types";
import { CONFIG } from "../config";
import {
  getSourceRegistry,
  createValidationTally,
  flushValidationTally,
  tallyValidation,
} from "../lib/storage";
import { logger } from "../lib/global-logger";
import { getTrustThreshold } from "../lib/config-utils";
import { createTimeoutSignal } from "../lib/utils";
import { validatedFetch } from "../lib/security";
import { getSourceCircuitBreaker } from "../lib/circuit-breaker";
import {
  parseHTMLContent,
  parseJSONContent,
  buildDeal,
} from "./discover-parsers";
import { calculateAdaptiveBudget, getDefaultBudgets } from "./discovery-budget";

// ============================================================================
// Discovery Engine
// ============================================================================

interface DiscoveryResult {
  deals: Deal[];
  errors: Array<{ url: string; error: string }>;
}

/**
 * Resolved discovery budget configuration. Exported for the ADR-018
 * shadow workflow so it mirrors the main path's budgets exactly.
 */
export interface DiscoveryBudgets {
  globalBudget: number;
  perSourceBase: number;
  highTrustBonus: number;
  trustThreshold: number;
}

export function getDiscoveryBudgets(env: Env): DiscoveryBudgets {
  const envName = env.ENVIRONMENT || "production";
  const budgetDefaults = getDefaultBudgets(envName);
  return {
    globalBudget: parseInt(
      env.CANDIDATE_BUDGET_GLOBAL || String(budgetDefaults.global),
      10,
    ),
    perSourceBase: parseInt(
      env.CANDIDATE_BUDGET_PER_SOURCE || String(budgetDefaults.perSource),
      10,
    ),
    highTrustBonus: parseInt(
      env.CANDIDATE_BUDGET_HIGH_TRUST_BONUS ||
        String(budgetDefaults.highTrustBonus),
      10,
    ),
    trustThreshold: getTrustThreshold(env),
  };
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
  _ctx: PipelineContext,
): Promise<DiscoveryResult> {
  const sources = await getSourceRegistry(env);
  let activeSources = sources.filter((s) => s.active);

  if (activeSources.length === 0) {
    logger.warn("No active sources configured", { component: "discovery" });
    return { deals: [], errors: [] };
  }

  // Budget configuration (shared with the ADR-018 shadow path via
  // getDiscoveryBudgets so both planes resolve identical budgets)
  const { globalBudget, perSourceBase, highTrustBonus, trustThreshold } =
    getDiscoveryBudgets(env);

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

  // Validation results are tallied in memory per source and flushed once
  // per source (see discoverFromSource). This collapses one KV GET+PUT
  // pair per URL pattern into one pair per source and removes the lost-update
  // race between parallel pattern batches writing the shared registry key.

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
        (source.validation_success_count || 0) +
          (source.validation_failure_count || 0) >
        0
          ? (source.validation_success_count || 0) /
            ((source.validation_success_count || 0) +
              (source.validation_failure_count || 0))
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

  // Fast pre-filter: cheap checks before expensive validation.
  // INVARIANT: normalization must NOT derive missing code/url/title —
  // this pre-filter runs before normalize and depends on them being absent.
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
  const breaker = getSourceCircuitBreaker(source.domain, env);
  const breakerState = await breaker.getState();
  if (breakerState === "open") {
    return {
      deals: [],
      errors: [{ url: source.domain, error: "Circuit breaker is open" }],
    };
  }

  const validationTally = createValidationTally();
  const { deals, errors } = await runPatternBatches(source, limit, (ok) =>
    tallyValidation(validationTally, source.domain, ok),
  );

  // All pattern batches for this source are done: persist tallied validation
  // counters in a single registry GET+PUT. Sequential per-source flushing
  // keeps concurrent writers on different domains; see
  // flushValidationTally for the residual cross-isolate race note.
  await flushValidationTally(env, validationTally);

  // Record breaker outcome: any error means failure for this source run.
  if (errors.length > 0 && deals.length === 0) {
    await breaker.recordFailure();
  } else if (deals.length > 0) {
    await breaker.recordSuccess();
  }

  return { deals, errors };
}

// Parallel pattern fetches per source batch (sequential batches).
const PATTERN_BATCH_CONCURRENCY = 3;

interface PatternFetchOutcome {
  patternDeals: Deal[];
  patternErrors: Array<{ url: string; error: string }>;
  ok: boolean;
}

/**
 * Run pattern batches for one source. Shared by the main path and the
 * ADR-018 shadow path. The optional hook reports per-pattern success so the
 * main path can tally validation in memory; the shadow path passes no hook
 * and is therefore read-only (no tally, no flush, no breaker writes).
 */
async function runPatternBatches(
  source: SourceConfig,
  limit: number,
  onPattern?: (ok: boolean) => void,
): Promise<DiscoveryResult> {
  const deals: Deal[] = [];
  const errors: Array<{ url: string; error: string }> = [];
  // Process URL patterns in parallel with a concurrency limit.
  // Uses sequential batch iteration to avoid race conditions on the limit check,
  // while fetching within each batch in parallel. After each batch, the total
  // is truncated if it exceeded the limit (due to concurrent fulfillment).
  let batchIndex = 0;
  while (batchIndex < source.url_patterns.length && deals.length < limit) {
    const batch = source.url_patterns.slice(
      batchIndex,
      batchIndex + PATTERN_BATCH_CONCURRENCY,
    );
    batchIndex += PATTERN_BATCH_CONCURRENCY;

    const results = await Promise.allSettled(
      batch.map(async (pattern) => {
        const outcome = await fetchPatternDeals(source, pattern);
        onPattern?.(outcome.ok);
        return {
          patternDeals: outcome.patternDeals,
          patternErrors: outcome.patternErrors,
        };
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

/**
 * Fetch, parse, and build deals for one URL pattern. Pure fetch+compute:
 * no tally, no persistence, no breaker interaction (callers own those).
 */
async function fetchPatternDeals(
  source: SourceConfig,
  pattern: string,
): Promise<PatternFetchOutcome> {
  try {
    const url = `https://${source.domain}${pattern}`;

    const { signal, cleanup } = createTimeoutSignal(CONFIG.FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await validatedFetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "DealDiscoveryBot/1.0 (AI Agent; Autonomous Discovery)",
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

    const extracted: ExtractedDeal[] = contentType.includes("application/json")
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

    return { patternDeals, patternErrors, ok: true };
  } catch (error) {
    return {
      patternDeals: [],
      patternErrors: [
        {
          url: `${source.domain}${pattern}`,
          error: (error as Error).message,
        },
      ],
      ok: false,
    };
  }
}

// Shadow step returns stay far under the 1 MiB workflow step limit.
const MAX_SHADOW_SAMPLE_CODES = 10;
const MAX_SHADOW_SAMPLE_ERRORS = 3;

/**
 * Compact per-source shadow result: counts plus small samples. No Deal
 * objects escape, keeping durable step returns tiny.
 */
export interface ShadowSourceSummary {
  domain: string;
  deal_count: number;
  error_count: number;
  sample_codes: string[];
  sample_errors: string[];
}

/**
 * Read-only single-source discovery for the ADR-018 shadow workflow.
 * Runs the same fetch+parse+build core as the main path but performs
 * zero writes: no validation tally, no registry flush, no breaker
 * interaction, no discovery-count mutation.
 */
export async function discoverSourceReadonly(
  source: SourceConfig,
  limit: number,
): Promise<ShadowSourceSummary> {
  const { deals, errors } = await runPatternBatches(source, limit);
  return {
    domain: source.domain,
    deal_count: deals.length,
    error_count: errors.length,
    sample_codes: deals.slice(0, MAX_SHADOW_SAMPLE_CODES).map((d) => d.code),
    sample_errors: errors
      .slice(0, MAX_SHADOW_SAMPLE_ERRORS)
      .map((e) => `${e.url}: ${e.error}`),
  };
}
