/**
 * Reward Scraper Module
 *
 * Re-scrapes deal pages to detect reward changes and validate current offers.
 * Compares current rewards with stored deals to identify discrepancies.
 *
 * Features:
 * - Re-scrape deal pages for current reward info
 * - Detect changes in reward values/types
 * - Extract reward data from HTML
 * - Track reward history over time
 */

import type { Deal, Reward, Env } from "../../types";
import { logger } from "../global-logger";
import { CircuitBreaker, getSourceCircuitBreaker } from "../circuit-breaker";
import { CONFIG } from "../../config";

// ============================================================================
// Types
// ============================================================================

export interface RewardScrapeResult {
  url: string;
  success: boolean;
  currentReward?: Reward;
  rewardChanged: boolean;
  previousReward?: Reward;
  changeDetails?: {
    typeChanged: boolean;
    valueChanged: boolean;
    oldValue?: number | string;
    newValue?: number | string;
  };
  scrapedAt: string;
  error?: string;
  rawData?: string;
}

export interface RewardChange {
  deal: Deal;
  previousReward: Reward;
  currentReward: Reward;
  changeType: "increased" | "decreased" | "type_changed" | "expired" | "new";
  severity: "info" | "warning" | "critical";
  detectedAt: string;
}

interface ExtractedReward {
  type?: "cash" | "credit" | "percent" | "item";
  value?: number | string;
  currency?: string;
  description?: string;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

const SCRAPE_TIMEOUT_MS = 15000;
const MAX_REWARD_CHANGE_THRESHOLD = 1000; // Flag if reward changes by more than $1000

// Common reward patterns in HTML
const REWARD_PATTERNS = {
  cash: [
    /\$?([0-9,]+(?:\.[0-9]{2})?)\s*(?:cash|bonus|reward)/i,
    /(?:get|earn|receive)\s*\$?([0-9,]+(?:\.[0-9]{2})?)/i,
    /\$?([0-9,]+(?:\.[0-9]{2})?)\s*(?:free|bonus)/i,
  ],
  percent: [
    /([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:off|discount|bonus)/i,
    /(?:save|get)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /([0-9]+)\s*percent/i,
  ],
  credit: [
    /\$?([0-9,]+)\s*(?:credit|credits)/i,
    /([0-9,]+)\s*(?:points|tokens|credits)/i,
  ],
  item: [
    /(?:free|bonus)\s+(.{3,50}?)(?:\s|$|[,.])/i,
    /get\s+(.{3,50}?)(?:\s+free|as\s+a\s+bonus)/i,
  ],
};

// Currency symbols and codes
const CURRENCY_PATTERNS = [
  { pattern: /\$|USD?/i, code: "USD" },
  { pattern: /€|EUR?/i, code: "EUR" },
  { pattern: /£|GBP?/i, code: "GBP" },
  { pattern: /CA\$|CAD/i, code: "CAD" },
  { pattern: /AU\$|AUD/i, code: "AUD" },
];

// ============================================================================
// Reward Scraping
// ============================================================================

/**
 * Scrape a deal page for current reward information
 *
 * Fetches the page and extracts reward data from HTML content.
 * Uses multiple pattern matching strategies for robust extraction.
 *
 * @param url - URL of the deal page
 * @param env - Worker environment
 * @returns Scraped reward result
 * @example
 * ```typescript
 * const result = await scrapeCurrentRewards("https://example.com/deal", env);
 * if (result.success && result.currentReward) {
 *   console.log(`Current reward: ${result.currentReward.value}`);
 * }
 * ```
 */
export async function scrapeCurrentRewards(
  url: string,
  env?: Env,
): Promise<RewardScrapeResult> {
  const scrapedAt = new Date().toISOString();
  const domain = extractDomain(url);

  logger.info(`Scraping rewards from: ${url}`, {
    component: "reward-scraper",
    domain,
  });

  // Get circuit breaker
  const breaker = env
    ? getSourceCircuitBreaker(domain, env)
    : new CircuitBreaker(`scrape:${domain}`, {
        failureThreshold: 3,
        resetTimeoutMs: 60000,
        halfOpenMaxCalls: 2,
      });

  try {
    const result = await breaker.execute(async () => {
      return await performRewardScrape(url);
    });

    logger.info(`Reward scraping completed`, {
      component: "reward-scraper",
      success: result.success,
      rewardFound: !!result.currentReward,
    });

    return {
      ...result,
      scrapedAt,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Scraping failed";

    logger.error(`Reward scraping failed`, {
      component: "reward-scraper",
      error: errorMessage,
    });

    return {
      url,
      success: false,
      rewardChanged: false,
      scrapedAt,
      error: errorMessage,
    };
  }
}

/**
 * Perform actual reward scraping
 */
async function performRewardScrape(
  url: string,
): Promise<Omit<RewardScrapeResult, "scrapedAt">> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        url,
        success: false,
        rewardChanged: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // HTML scraping: Pages are typically small (<1MB). Using response.text() is acceptable
    // for extracting reward information from referral pages.
    const html = await response.text();
    const extractedReward = extractRewardFromHTML(html);

    if (!extractedReward || extractedReward.confidence < 0.3) {
      return {
        url,
        success: false,
        rewardChanged: false,
        error: "Could not extract reward information from page",
        rawData: html.slice(0, 1000), // First 1000 chars for debugging
      };
    }

    const currentReward: Reward = {
      type: extractedReward.type || "cash",
      value: extractedReward.value || 0,
      currency: extractedReward.currency,
      description: extractedReward.description,
    };

    return {
      url,
      success: true,
      currentReward,
      rewardChanged: false, // Will be determined by caller with previous reward
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// ============================================================================
// HTML Reward Extraction
// ============================================================================

/**
 * Extract reward information from HTML content
 *
 * Uses multiple pattern matching strategies to find reward values.
 * Looks for common patterns like "$50 bonus", "20% off", etc.
 *
 * @param html - HTML content to parse
 * @returns Extracted reward data with confidence score
 * @example
 * ```typescript
 * const html = '<div>Get $50 bonus when you sign up!</div>';
 * const reward = extractRewardFromHTML(html);
 * // reward = { type: "cash", value: 50, currency: "USD", confidence: 0.8 }
 * ```
 */
export function extractRewardFromHTML(html: string): ExtractedReward | null {
  const text = extractTextFromHtml(html);
  const candidates: ExtractedReward[] = [];

  // Try cash patterns
  for (const pattern of REWARD_PATTERNS.cash) {
    const match = text.match(pattern);
    if (match) {
      const value = parseValue(match[1]);
      const currency = detectCurrency(text, match.index || 0);
      candidates.push({
        type: "cash",
        value,
        currency,
        confidence: 0.8,
      });
    }
  }

  // Try percent patterns
  for (const pattern of REWARD_PATTERNS.percent) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      candidates.push({
        type: "percent",
        value,
        confidence: 0.75,
      });
    }
  }

  // Try credit patterns
  for (const pattern of REWARD_PATTERNS.credit) {
    const match = text.match(pattern);
    if (match) {
      const value = parseValue(match[1]);
      candidates.push({
        type: "credit",
        value,
        confidence: 0.7,
      });
    }
  }

  // Try item patterns (free items)
  for (const pattern of REWARD_PATTERNS.item) {
    const match = text.match(pattern);
    if (match) {
      candidates.push({
        type: "item",
        value: match[1].trim(),
        confidence: 0.6,
      });
    }
  }

  // Look for reward in structured data / meta tags
  const structuredReward = extractFromStructuredData(html);
  if (structuredReward) {
    candidates.push({
      ...structuredReward,
      confidence: 0.9, // Higher confidence for structured data
    });
  }

  // Return best candidate
  if (candidates.length === 0) {
    return null;
  }

  // Sort by confidence and return best
  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];

  // Look for description context
  const description = findRewardDescription(text, best);

  return {
    ...best,
    description,
  };
}

/**
 * Extract text content from HTML
 */
function extractTextFromHtml(html: string): string {
  // Simple HTML tag removal (not perfect but sufficient for reward extraction)
  return html
    .replace(/<script[^>]*>.*?<\/script>/gis, "")
    .replace(/<style[^>]*>.*?<\/style>/gis, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse numeric value from string (removes commas)
 */
function parseValue(valueStr: string): number {
  const cleaned = valueStr.replace(/,/g, "");
  return parseFloat(cleaned);
}

/**
 * Detect currency from context
 */
function detectCurrency(text: string, position: number): string | undefined {
  // Look at surrounding text for currency indicators
  const context = text.slice(Math.max(0, position - 50), position + 50);

  for (const { pattern, code } of CURRENCY_PATTERNS) {
    if (pattern.test(context)) {
      return code;
    }
  }

  return undefined;
}

/**
 * Extract reward from structured data (JSON-LD, meta tags)
 */
function extractFromStructuredData(
  html: string,
): Partial<ExtractedReward> | null {
  // Try to find JSON-LD offer data
  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (jsonLdMatch) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data["@type"] === "Offer" && data.price) {
        return {
          type: "cash",
          value: parseFloat(data.price),
          currency: data.priceCurrency,
        };
      }
    } catch {
      // JSON parse failed, continue with other methods
    }
  }

  // Try meta tags
  const metaDescription = html.match(
    /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i,
  );
  if (metaDescription) {
    // Try to extract from description
    const desc = metaDescription[1];
    for (const pattern of REWARD_PATTERNS.cash) {
      const match = desc.match(pattern);
      if (match) {
        return {
          type: "cash",
          value: parseValue(match[1]),
        };
      }
    }
  }

  return null;
}

/**
 * Find descriptive text around reward mention
 */
function findRewardDescription(
  text: string,
  reward: ExtractedReward,
): string | undefined {
  // Simple heuristic: look for sentence containing the reward value
  const sentences = text.split(/[.!?]+/);
  const valueStr = String(reward.value);

  for (const sentence of sentences) {
    if (sentence.includes(valueStr)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10 && trimmed.length < 200) {
        return trimmed;
      }
    }
  }

  return undefined;
}

// ============================================================================
// Reward Change Detection
// ============================================================================

/**
 * Detect if a deal's reward has changed
 *
 * Compares current scraped reward with stored deal reward.
 * Returns detailed change information.
 *
 * @param deal - Stored deal to check
 * @param env - Worker environment
 * @returns Change detection result
 * @example
 * ```typescript
 * const change = await detectRewardChanges(deal, env);
 * if (change.changeType === "decreased") {
 *   console.log(`Reward decreased from ${change.previousReward.value} to ${change.currentReward.value}`);
 * }
 * ```
 */
export async function detectRewardChanges(
  deal: Deal,
  env?: Env,
): Promise<RewardChange | null> {
  logger.info(`Checking for reward changes: ${deal.id}`, {
    component: "reward-scraper",
    dealId: deal.id,
  });

  // Scrape current rewards
  const scrapeResult = await scrapeCurrentRewards(deal.url, env);

  if (!scrapeResult.success || !scrapeResult.currentReward) {
    logger.warn(`Could not scrape current rewards for deal`, {
      component: "reward-scraper",
      dealId: deal.id,
      error: scrapeResult.error,
    });
    return null;
  }

  const currentReward = scrapeResult.currentReward;
  const previousReward = deal.reward;

  // Compare rewards
  const change = compareRewards(previousReward, currentReward);

  if (!change.changed) {
    logger.info(`No reward change detected for deal`, {
      component: "reward-scraper",
      dealId: deal.id,
    });
    return null;
  }

  // Determine change type
  let changeType: RewardChange["changeType"];
  let severity: RewardChange["severity"] = "info";

  if (change.typeChanged) {
    changeType = "type_changed";
    severity = "warning";
  } else if (change.valueDecreased) {
    changeType = "decreased";
    severity = "warning";
  } else if (change.valueIncreased) {
    changeType = "increased";
    severity = "info";
  } else {
    changeType = "new";
    severity = "info";
  }

  // Critical if change is very large
  if (
    typeof change.oldValue === "number" &&
    typeof change.newValue === "number" &&
    Math.abs(change.newValue - change.oldValue) > MAX_REWARD_CHANGE_THRESHOLD
  ) {
    severity = "critical";
  }

  logger.info(`Reward change detected for deal`, {
    component: "reward-scraper",
    dealId: deal.id,
    changeType,
    severity,
  });

  return {
    deal,
    previousReward,
    currentReward,
    changeType,
    severity,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Compare two rewards and determine if/how they changed
 */
function compareRewards(
  previous: Reward,
  current: Reward,
): {
  changed: boolean;
  typeChanged: boolean;
  valueChanged: boolean;
  valueIncreased: boolean;
  valueDecreased: boolean;
  oldValue?: number | string;
  newValue?: number | string;
} {
  const typeChanged = previous.type !== current.type;

  // Compare values
  const oldValue = normalizeValue(previous.value);
  const newValue = normalizeValue(current.value);
  const valueChanged = oldValue !== newValue;
  const valueIncreased =
    typeof oldValue === "number" &&
    typeof newValue === "number" &&
    newValue > oldValue;
  const valueDecreased =
    typeof oldValue === "number" &&
    typeof newValue === "number" &&
    newValue < oldValue;

  return {
    changed: typeChanged || valueChanged,
    typeChanged,
    valueChanged,
    valueIncreased,
    valueDecreased,
    oldValue,
    newValue,
  };
}

/**
 * Normalize reward value for comparison
 */
function normalizeValue(value: number | string): number | string {
  if (typeof value === "number") {
    return Math.round(value * 100) / 100; // Round to 2 decimal places
  }
  return String(value).toLowerCase().trim();
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Batch scrape rewards for multiple deals
 *
 * Processes deals with rate limiting to be respectful to source sites.
 *
 * @param deals - Deals to scrape
 * @param env - Worker environment
 * @returns Array of scrape results
 * @example
 * ```typescript
 * const deals = [deal1, deal2, deal3];
 * const results = await batchScrapeRewards(deals, env);
 * const changes = results.filter(r => r.rewardChanged);
 * ```
 */
export async function batchScrapeRewards(
  deals: Deal[],
  env?: Env,
): Promise<RewardScrapeResult[]> {
  logger.info(`Starting batch reward scraping for ${deals.length} deals`, {
    component: "reward-scraper",
    batchSize: deals.length,
  });

  const results: RewardScrapeResult[] = [];
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // Group by domain to respect rate limits
  const domainGroups = new Map<string, Deal[]>();
  for (const deal of deals) {
    const domain = extractDomain(deal.url);
    if (!domainGroups.has(domain)) {
      domainGroups.set(domain, []);
    }
    domainGroups.get(domain)!.push(deal);
  }

  // Process each domain group
  for (const [, domainDeals] of domainGroups) {
    for (const deal of domainDeals) {
      try {
        const result = await scrapeCurrentRewards(deal.url, env);

        // Add previous reward info if we got a current reward
        if (result.currentReward) {
          const change = compareRewards(deal.reward, result.currentReward);
          results.push({
            ...result,
            rewardChanged: change.changed,
            previousReward: change.changed ? deal.reward : undefined,
            changeDetails: change.changed
              ? {
                  typeChanged: change.typeChanged,
                  valueChanged: change.valueChanged,
                  oldValue: change.oldValue,
                  newValue: change.newValue,
                }
              : undefined,
          });
        } else {
          results.push(result);
        }

        // Rate limit delay
        await delay(1000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        results.push({
          url: deal.url,
          success: false,
          rewardChanged: false,
          scrapedAt: new Date().toISOString(),
          error: errorMessage,
        });
      }
    }
  }

  logger.info(`Batch reward scraping completed`, {
    component: "reward-scraper",
    total: results.length,
    successful: results.filter((r) => r.success).length,
    changed: results.filter((r) => r.rewardChanged).length,
  });

  return results;
}

/**
 * Get deals with reward changes from batch results
 */
export function getDealsWithRewardChanges(
  results: RewardScrapeResult[],
): RewardScrapeResult[] {
  return results.filter((r) => r.success && r.rewardChanged && r.currentReward);
}

/**
 * Get statistics from batch scraping
 */
export function getScrapingStats(results: RewardScrapeResult[]): {
  total: number;
  successful: number;
  failed: number;
  withChanges: number;
  increased: number;
  decreased: number;
  typeChanged: number;
} {
  const successful = results.filter((r) => r.success).length;
  const withChanges = results.filter((r) => r.rewardChanged).length;
  const increased = results.filter(
    (r) =>
      r.changeDetails?.valueChanged &&
      r.currentReward &&
      normalizeValue(r.currentReward.value) >
        normalizeValue(r.previousReward?.value || 0),
  ).length;
  const decreased = results.filter(
    (r) =>
      r.changeDetails?.valueChanged &&
      r.currentReward &&
      normalizeValue(r.currentReward.value) <
        normalizeValue(r.previousReward?.value || 0),
  ).length;
  const typeChanged = results.filter(
    (r) => r.changeDetails?.typeChanged,
  ).length;

  return {
    total: results.length,
    successful,
    failed: results.length - successful,
    withChanges,
    increased,
    decreased,
    typeChanged,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
