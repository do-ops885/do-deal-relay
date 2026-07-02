// Hacker News Scraper
// ============================================================================
//
// Real implementation backed by the Algolia HN Search API.
// Reuses fetchHackerNewsDeals — only adds Scraper interface conformance.

import { fetchHackerNewsDeals } from "../api-fetchers";
import type { FetchResult } from "../types";
import {
  type Scraper,
  type ScraperEnv,
  type SourceName,
} from "./base";

export class HackerNewsScraper implements Scraper {
  readonly name: SourceName = "hackernews";

  isReady(_env: ScraperEnv): boolean {
    // HN Algolia search is public — no auth needed.
    return true;
  }

  async scrape(
    _env: ScraperEnv,
    query: string,
    limit: number = 50,
  ): Promise<FetchResult> {
    return fetchHackerNewsDeals(query, limit);
  }
}
