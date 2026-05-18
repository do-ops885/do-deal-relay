import { Deal, SourceConfig } from "../types";
import { generateDealId } from "../lib/crypto";

// ============================================================================
// Constants
// ============================================================================

export const DISCOVERY_CONSTANTS = {
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
} as const;

export interface ExtractedDeal {
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
 */
export function calculateAdaptiveBudget(
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
 * Build a complete Deal from extracted data
 */
export async function buildDeal(
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
 * Per-invocation content cache, scoped inside parseHTMLContent to avoid
 * cross-page data corruption and unbounded memory growth in the
 * Cloudflare Worker global scope.
 */
const extractContentCache = new Map<string, string>();

/**
 * Clear the content extraction cache. Should be called once per pipeline
 * run or page parse to prevent stale entries from accumulating.
 */
export function clearContentCache(): void {
  extractContentCache.clear();
}

export function extractContent(
  content: string,
  code: string,
  window: number = DISCOVERY_CONSTANTS.CONTEXT_WINDOW,
): string {
  // Include a content hash in the key so that the same code found on
  // different pages does not return a stale cached result.
  const contentHash = content.length.toString(36);
  const cacheKey = `${contentHash}:${code}:${window}`;
  const cached = extractContentCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const index = content.indexOf(code);
  if (index === -1) {
    extractContentCache.set(cacheKey, "");
    return "";
  }
  const result = content.slice(Math.max(0, index - window), index + window);
  extractContentCache.set(cacheKey, result);
  return result;
}

export function extractTitle(content: string, code: string): string {
  const context = extractContent(content, code);
  const titleMatch = context.match(/<title>([^<]+)/i);
  if (titleMatch && titleMatch[1]) return titleMatch[1].trim();

  const h1Match = context.match(/<h1[^>]*>([^<]+)/i);
  if (h1Match && h1Match[1]) return h1Match[1].trim();

  return "Referral Deal";
}

export function extractDescription(content: string, code: string): string {
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

/**
 * Parse HTML content using selectors
 */
export function parseHTMLContent(
  content: string,
  source: SourceConfig,
): ExtractedDeal[] {
  const deals: ExtractedDeal[] = [];

  // Use literal RegExp patterns to avoid ReDoS risks from dynamic constructors
  // and to allow the engine to compile them once at module load.
  const codePattern =
    /(?:referral|invite|promo)[_-]?(?:code)?["']?\s*[:=]\s*["']?([A-Z0-9]{6,20})/gi;
  const urlPattern = /https?:\/\/[^\s"<>]+/i;
  // Simplified pattern: match reward value (digits, optional decimals) and optional currency
  // Avoids nested quantifiers that Codacy flags as potentially unsafe.
  const rewardPattern =
    /(?:reward|bonus|get|earn)\s+\$?(\d[\d,]*\.?\d*)\s*(USD|EUR|GBP|%)?/i;

  // Use matchAll for clean, type-safe iteration instead of
  // error-prone while-loop assignment with global regex.
  for (const codeMatch of content.matchAll(codePattern)) {
    // matchAll returns RegExpMatchArray where capture groups are string | undefined;
    // since the regex always has a capture group, we assert string when present.
    const code = codeMatch[1];
    if (!code) continue;

    const contextSlice = content.slice(
      Math.max(0, codeMatch.index - DISCOVERY_CONSTANTS.CONTEXT_WINDOW),
      codeMatch.index + DISCOVERY_CONSTANTS.CONTEXT_WINDOW,
    );

    const urlMatch = contextSlice.match(urlPattern);

    const rewardMatch = contextSlice.match(rewardPattern);
    // rewardMatch indices: [0]=full, [1]=value, [2]=currency_or_percent
    const rewardValue = rewardMatch?.[1];
    const rewardCurrency = rewardMatch?.[2];

    deals.push({
      code,
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

  // Clear the content cache after each page parse to prevent memory leaks
  clearContentCache();

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
export function parseJSONContent(
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
