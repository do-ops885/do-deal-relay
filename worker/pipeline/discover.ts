import { Deal, SourceConfig, PipelineError, PipelineContext } from "../types";
import type { Env } from "../types";
import { CONFIG } from "../config";
import { getSourceRegistry, recordSourceValidation } from "../lib/storage";
import { extractBySelectors } from "../lib/html-utils";
import { generateDealId, calculateStringSimilarity } from "../lib/crypto";
import { logger } from "../lib/global-logger";
import { getTrustThreshold } from "../lib/config-utils";

// ============================================================================
// Constants
// ============================================================================

const DISCOVERY_CONSTANTS = {
  HIGH_TRUST_THRESHOLD: 0.7,
  VALIDATION_SUCCESS_THRESHOLD_HIGH: 0.8,
  VALIDATION_SUCCESS_THRESHOLD_MEDIUM: 0.5,
  BONUS_SUCCESS_HIGH: 0.5, // 50%
  BONUS_SUCCESS_MEDIUM: 0.25, // 25%
  PENALTY_SUCCESS_LOW: 0.75, // 25% penalty
  MATURITY_THRESHOLD_HIGH: 10,
  MATURITY_THRESHOLD_MEDIUM: 5,
  BONUS_MATURITY_HIGH: 0.2, // 20%
  BONUS_MATURITY_MEDIUM: 0.1, // 10%
  CONTEXT_WINDOW: 500,
  DESCRIPTION_CONTEXT_WINDOW: 300,
  EXPIRY_CONFIDENCE_DATE: 0.8,
  EXPIRY_CONFIDENCE_UNKNOWN: 0.3,
  MIN_CODE_LENGTH: 6,
  MAX_CODE_LENGTH: 20,
} as const;

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
 * Calculate an adaptive per-source budget based on historical performance.
 *
 * Factors:
 * - Base budget (env or default)
 * - Trust bonus (high-trust sources get more)
 * - Validation success rate (sources that produce valid deals get more budget)
 * - Discovery maturity (sources with more history get a small bonus)
 */
function calculateAdaptiveBudget(
  source: SourceConfig,
  perSourceBase: number,
  highTrustBonus: number,
): number {
  let budget = perSourceBase;

  // Trust bonus
  if (source.trust_initial > DISCOVERY_CONSTANTS.HIGH_TRUST_THRESHOLD) {
    budget += highTrustBonus;
  }

  // Validation success rate bonus
  const totalValidations =
    (source.validation_success_count || 0) +
    (source.validation_failure_count || 0);
  if (totalValidations > 0) {
    const successRate =
      (source.validation_success_count || 0) / totalValidations;
    // Add bonus for sources with high validation success
    if (successRate >= DISCOVERY_CONSTANTS.VALIDATION_SUCCESS_THRESHOLD_HIGH) {
      budget += Math.round(
        perSourceBase * DISCOVERY_CONSTANTS.BONUS_SUCCESS_HIGH,
      );
    } else if (
      successRate >= DISCOVERY_CONSTANTS.VALIDATION_SUCCESS_THRESHOLD_MEDIUM
    ) {
      budget += Math.round(
        perSourceBase * DISCOVERY_CONSTANTS.BONUS_SUCCESS_MEDIUM,
      );
    }
    // Apply penalty for sources with low success rate
    if (
      successRate < DISCOVERY_CONSTANTS.VALIDATION_SUCCESS_THRESHOLD_MEDIUM &&
      successRate > 0
    ) {
      budget = Math.round(budget * DISCOVERY_CONSTANTS.PENALTY_SUCCESS_LOW);
    }
  }

  // Discovery maturity bonus (sources with history get a small boost)
  const discoveryCount = source.discovery_count || 0;
  if (discoveryCount >= DISCOVERY_CONSTANTS.MATURITY_THRESHOLD_HIGH) {
    budget += Math.round(
      perSourceBase * DISCOVERY_CONSTANTS.BONUS_MATURITY_HIGH,
    );
  } else if (discoveryCount >= DISCOVERY_CONSTANTS.MATURITY_THRESHOLD_MEDIUM) {
    budget += Math.round(
      perSourceBase * DISCOVERY_CONSTANTS.BONUS_MATURITY_MEDIUM,
    );
  }

  return budget;
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

  // Clear module-level content cache for fresh discovery run
  contentCache.clear();

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

  return { deals, errors };
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

          const response = await fetch(url, {
            method: "GET",
            headers: {
              "User-Agent":
                "DealDiscoveryBot/1.0 (AI Agent; Autonomous Discovery)",
              Accept: "text/html,application/json",
            },
            signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT_MS),
          });

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

/**
 * Parse HTML content using selectors
 */
function parseHTMLContent(
  content: string,
  source: SourceConfig,
): ExtractedDeal[] {
  const deals: ExtractedDeal[] = [];
  const selectors = source.selectors || {};

  // 1. Try CSS selectors if available
  if (Object.keys(selectors).length > 0) {
    const extracted = extractBySelectors(content, selectors);
    const codes = extracted["code"] || [];
    if (codes.length > 0) {
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (!code) continue;

        const rewards = extracted["reward"];
        const urls = extracted["url"];
        const reward = rewards?.[i] || rewards?.[0] || "";
        const url =
          urls[i] || urls?.[0] || `https://${source.domain}/invite/${code}`;

        // Simple heuristic for reward parsing from selector text
        const rewardValueMatch = reward.match(/\$?([0-9,]+(?:\.[0-9]+)?)/);
        const rewardValue = rewardValueMatch?.[1]
          ? parseFloat(rewardValueMatch[1].replace(",", ""))
          : 0;
        const rewardCurrency = reward.match(/USD|EUR|GBP/)
          ? reward.match(/USD|EUR|GBP/)?.[0]
          : undefined;
        const isPercent = reward.includes("%");

        deals.push({
          code: code.toUpperCase(),
          url,
          title: extractTitle(content, code),
          description: extractDescription(content, code),
          reward_type: isPercent
            ? "percent"
            : rewardValue > 0
              ? "cash"
              : "credit",
          reward_value: rewardValue,
          reward_currency: rewardCurrency,
        });
      }

      // Selector extraction succeeded — return early, use regex only as fallback
      const seen = new Set<string>();
      return deals.filter((d) => {
        if (seen.has(d.code)) return false;
        seen.add(d.code);
        return true;
      });
    }
  }

  // 2. Fallback: regex extraction when selectors are unavailable or found nothing
  const codePattern =
    /(?:referral|invite|promo)[_-]?(?:code)?["']?\s*[:=]\s*["']?([A-Z0-9]{6,20})/gi;
  const urlPattern = /https?:\/\/[^\s"<>]+/i;
  const rewardPattern =
    /(?:reward|bonus|get|earn)\s+\$?(\d[\d,]*\.?\d*)\s*(USD|EUR|GBP|%)?/i;

  for (const codeMatch of content.matchAll(codePattern)) {
    const code = codeMatch[1];
    if (!code) continue;

    const contextSlice = content.slice(
      Math.max(0, codeMatch.index - DISCOVERY_CONSTANTS.CONTEXT_WINDOW),
      codeMatch.index + DISCOVERY_CONSTANTS.CONTEXT_WINDOW,
    );

    const urlMatch = contextSlice.match(urlPattern);
    const rewardMatch = contextSlice.match(rewardPattern);
    const rewardValue = rewardMatch?.[1];
    const rewardCurrency = rewardMatch?.[2];

    deals.push({
      code: code.toUpperCase(),
      url:
        urlMatch && urlMatch[0]
          ? urlMatch[0]
          : `https://${source.domain}/invite/${code}`,
      title: extractTitle(content, code),
      description: extractDescription(content, code),
      reward_type:
        rewardCurrency === "%" ? "percent" : rewardCurrency ? "cash" : "credit",
      reward_value: rewardValue ? parseFloat(rewardValue.replace(",", "")) : 0,
      reward_currency:
        rewardCurrency && rewardCurrency !== "%" ? rewardCurrency : undefined,
    });
  }

  const seen = new Set<string>();
  return deals.filter((d) => {
    if (seen.has(d.code)) return false;
    seen.add(d.code);
    return true;
  });
}

/**
 * Parse JSON content
 */
function parseJSONContent(
  content: string,
  source: SourceConfig,
): ExtractedDeal[] {
  try {
    const data = JSON.parse(content);
    const deals: ExtractedDeal[] = [];

    const items = Array.isArray(data)
      ? data
      : data.deals || data.items || [data];

    for (const item of items) {
      if (item.code || item.referral_code || item.invite_code) {
        deals.push({
          code: item.code || item.referral_code || item.invite_code,
          url:
            item.url ||
            item.link ||
            `https://${source.domain}/invite/${item.code}`,
          title: item.title || item.name || `${source.domain} Referral`,
          description: item.description || `Referral code for ${source.domain}`,
          reward_type: item.reward_type || (item.percent ? "percent" : "cash"),
          reward_value: item.reward_value || item.amount || item.bonus || 0,
          reward_currency: item.currency || item.reward_currency,
          expiry_date: item.expiry || item.expires_at,
        });
      }
    }

    return deals;
  } catch {
    return [];
  }
}

/**
 * Build a complete Deal from extracted data
 */
async function buildDeal(
  extracted: ExtractedDeal,
  source: SourceConfig,
): Promise<Deal> {
  const domain = source.domain;
  const now = new Date().toISOString();

  const id = await generateDealId(
    domain,
    extracted.code,
    extracted.reward_type,
  );

  return {
    id,
    source: {
      url: extracted.url,
      domain,
      discovered_at: now,
      trust_score: source.trust_initial,
    },
    title: extracted.title,
    description: extracted.description,
    code: extracted.code,
    url: extracted.url,
    reward: {
      type: extracted.reward_type as "cash" | "credit" | "percent" | "item",
      value: extracted.reward_value,
      currency: extracted.reward_currency,
    },
    expiry: {
      date: extracted.expiry_date,
      confidence: extracted.expiry_date
        ? DISCOVERY_CONSTANTS.EXPIRY_CONFIDENCE_DATE
        : DISCOVERY_CONSTANTS.EXPIRY_CONFIDENCE_UNKNOWN,
      type: extracted.expiry_date ? "hard" : "unknown",
    },
    metadata: {
      category: ["referral", "signup"],
      tags: [domain, extracted.reward_type],
      normalized_at: now,
      confidence_score: source.trust_initial,
      status: "active",
    },
  };
}

/**
 * Extract content from context with memoization.
 * Caches context slices by (code, window) to avoid re-computing
 * the same slice when extracting both title and description.
 */
const contentCache = new Map<string, string>();

function extractContent(
  content: string,
  code: string,
  window: number = DISCOVERY_CONSTANTS.CONTEXT_WINDOW,
): string {
  const cacheKey = `${code}:${window}`;
  const cached = contentCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const index = content.indexOf(code);
  if (index === -1) {
    contentCache.set(cacheKey, "");
    return "";
  }
  const result = content.slice(Math.max(0, index - window), index + window);
  contentCache.set(cacheKey, result);
  return result;
}

function extractTitle(content: string, code: string): string {
  const context = extractContent(content, code);
  const titleMatch = context.match(/<title>([^<]+)/i);
  if (titleMatch && titleMatch[1]) return titleMatch[1].trim();

  const h1Match = context.match(/<h1[^>]*>([^<]+)/i);
  if (h1Match && h1Match[1]) return h1Match[1].trim();

  return "Referral Deal";
}

function extractDescription(content: string, code: string): string {
  const context = extractContent(
    content,
    code,
    DISCOVERY_CONSTANTS.DESCRIPTION_CONTEXT_WINDOW,
  );
  const metaMatch = context.match(
    /<meta[^>]*description[^>]*content="([^"]+)"/i,
  );
  if (metaMatch && metaMatch[1]) return metaMatch[1].trim();

  const pMatch = context.match(/<p[^>]*>([^<]+)/i);
  if (pMatch && pMatch[1]) return pMatch[1].trim();

  return `Use referral code ${code}`;
}
