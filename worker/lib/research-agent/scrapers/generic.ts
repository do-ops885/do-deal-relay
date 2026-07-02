// Generic HTML Scraper
// ============================================================================
//
// Real implementation for arbitrary referral-program landing pages.
// Uses fetchGenericPageContent; the orchestrator extracts referral codes
// via the existing extractReferralsFromContent() helper after HTML fetches.

import { fetchGenericPageContent } from "../page-fetcher";
import type { FetchResult } from "../types";
import {
  type Scraper,
  type ScraperEnv,
  buildFetchError,
  type SourceName,
} from "./base";

type GenericEnv = ScraperEnv & {
  baseUrl?: string;
  searchPattern?: string;
};

export class GenericScraper implements Scraper {
  readonly name: SourceName = "company_site";

  isReady(env: GenericEnv): boolean {
    return Boolean(env.baseUrl);
  }

  async scrape(
    env: GenericEnv,
    query: string,
    _limit?: number,
  ): Promise<FetchResult> {
    const startTime = Date.now();
    if (!env.baseUrl) {
      return buildFetchError(
        400,
        "Generic scraper requires env.baseUrl",
        startTime,
      );
    }
    const pattern =
      env.searchPattern?.replace("{query}", encodeURIComponent(query)) ??
      `?q=${encodeURIComponent(query)}`;
    return fetchGenericPageContent(`${env.baseUrl}${pattern}`);
  }
}
