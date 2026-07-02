// Reddit Scraper
// ============================================================================
//
// Real implementation backed by Reddit's OAuth-aware listing endpoint.
// Reuses fetchRedditDeals which handles both OAuth and public JSON fallback.

import { fetchRedditDeals } from "../reddit-fetcher";
import type { FetchResult } from "../types";
import { type Scraper, type ScraperEnv, type SourceName } from "./base";

export class RedditScraper implements Scraper {
  readonly name: SourceName = "reddit";

  isReady(_env: ScraperEnv): boolean {
    // Reddit works with or without OAuth (lower rate limits without).
    return true;
  }

  async scrape(
    env: ScraperEnv,
    query: string,
    limit: number = 25,
  ): Promise<FetchResult> {
    return fetchRedditDeals(
      env.REDDIT_CLIENT_ID,
      env.REDDIT_CLIENT_SECRET,
      query,
      undefined,
      limit,
    );
  }
}
