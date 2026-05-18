import { Deal, SourceConfig } from "../types";
import { CONFIG } from "../config";
import { generateDealId } from "../lib/crypto";
import { extractBySelectors } from "../lib/html-utils";

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
  MIN_CODE_LENGTH: 6,
  MAX_CODE_LENGTH: 20,
} as const;

// ============================================================================
// Types
// ============================================================================

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
 * Extract content from context with memoization.
 */
const contentCache = new Map<string, string>();

export function clearContentCache(): void {
  contentCache.clear();
}

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

export function extractTitle(content: string, code: string): string {
  const context = extractContent(content, code);
  const titleMatch = context.match(/<title>([^<]+)/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();

  const h1Match = context.match(/<h1[^>]*>([^<]+)/i);
  if (h1Match?.[1]) return h1Match[1].trim();

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
  if (metaMatch?.[1]) return metaMatch[1].trim();

  const pMatch = context.match(/<p[^>]*>([^<]+)/i);
  if (pMatch?.[1]) return pMatch[1].trim();

  return `Use referral code ${code}`;
}

/**
 * Parse HTML content using selectors first, with regex as fallback
 */
export function parseHTMLContent(
  content: string,
  source: SourceConfig,
): ExtractedDeal[] {
  const deals: ExtractedDeal[] = [];

  // 1. Try CSS selectors if available (primary strategy)
  if (Object.keys(source.selectors || {}).length > 0) {
    const extracted = extractBySelectors(content, source.selectors!);
    const codes = extracted["code"] || [];
    if (codes.length > 0) {
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (!code) continue;

        const rewards = extracted["reward"];
        const reward = rewards[i] || rewards?.[0] || "";

        const urls = extracted["url"];
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
  const codePattern = new RegExp(
    `(?:referral|invite|promo)[_-]?(?:code)?["']?\\s*[:=]\\s*["']?([A-Z0-9]{${DISCOVERY_CONSTANTS.MIN_CODE_LENGTH},${DISCOVERY_CONSTANTS.MAX_CODE_LENGTH}})`,
    "gi",
  );
  const urlPattern = /https?:\/\/[^\s"<>]+/gi;
  const rewardPattern =
    /(?:reward|bonus|get|earn)\s+\$?([0-9,]+(?:\.[0-9]+)?)\s*(USD|EUR|GBP|%)?/gi;

  let match;
  while ((match = codePattern.exec(content)) !== null) {
    const code = match[1];
    if (code === undefined) continue;

    const urlMatch = content
      .slice(
        Math.max(0, match.index - DISCOVERY_CONSTANTS.CONTEXT_WINDOW),
        match.index + DISCOVERY_CONSTANTS.CONTEXT_WINDOW,
      )
      .match(urlPattern);

    const rewardMatch = content
      .slice(
        Math.max(0, match.index - DISCOVERY_CONSTANTS.CONTEXT_WINDOW),
        match.index + DISCOVERY_CONSTANTS.CONTEXT_WINDOW,
      )
      .match(rewardPattern);

    deals.push({
      code: code.toUpperCase(),
      url:
        urlMatch && urlMatch[0]
          ? urlMatch[0]
          : `https://${source.domain}/invite/${code}`,
      title: extractTitle(content, code),
      description: extractDescription(content, code),
      reward_type:
        rewardMatch && rewardMatch[3]
          ? rewardMatch[3] === "%"
            ? "percent"
            : "cash"
          : "credit",
      reward_value:
        rewardMatch && rewardMatch[1]
          ? parseFloat(rewardMatch[1].replace(",", ""))
          : 0,
      reward_currency:
        rewardMatch?.[3] && rewardMatch[3] !== "%" ? rewardMatch[3] : undefined,
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
