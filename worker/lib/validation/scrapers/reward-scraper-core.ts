import type { Reward, Env } from "../../../types";
import { logger } from "../../global-logger";
import { CircuitBreaker, getSourceCircuitBreaker } from "../../circuit-breaker";
import { CONFIG } from "../../../config";
import { validateUrl, validateFetchUrl } from "../../security";
import type { RewardScrapeResult } from "./types";
import { SCRAPE_TIMEOUT_MS } from "./types";
import { extractRewardFromHTML } from "./html-extractor";

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

async function performRewardScrape(
  url: string,
): Promise<Omit<RewardScrapeResult, "scrapedAt">> {
  if (!validateUrl(url)) {
    return {
      url,
      success: false,
      rewardChanged: false,
      error: "Invalid or disallowed URL",
    };
  }

  if (!(await validateFetchUrl(url))) {
    return {
      url,
      success: false,
      rewardChanged: false,
      error: "Blocked by SSRF protection",
    };
  }

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

    const html = await response.text();
    const extractedReward = extractRewardFromHTML(html);

    if (!extractedReward || extractedReward.confidence < 0.3) {
      return {
        url,
        success: false,
        rewardChanged: false,
        error: "Could not extract reward information from page",
        rawData: html.slice(0, 1000),
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
      rewardChanged: false,
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

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
