// ProductHunt Scraper
// ============================================================================
//
// Real implementation backed by ProductHunt's GraphQL API.
// Reuses the existing fetchProductHuntDeals from api-fetchers.ts to avoid code
// duplication — this module only adds the Scraper interface conformance.

import { fetchProductHuntDeals } from "../api-fetchers";
import type { FetchResult } from "../types";
import {
  type Scraper,
  type ScraperEnv,
  buildFetchError,
  type SourceName,
} from "./base";

export class ProductHuntScraper implements Scraper {
  readonly name: SourceName = "producthunt";

  isReady(env: ScraperEnv): boolean {
    return Boolean(env.PRODUCTHUNT_API_TOKEN);
  }

  async scrape(
    env: ScraperEnv,
    query: string,
    limit: number = 20,
  ): Promise<FetchResult> {
    if (!this.isReady(env)) {
      return buildFetchError(
        401,
        "ProductHunt API token not configured",
        Date.now(),
      );
    }
    return fetchProductHuntDeals(env.PRODUCTHUNT_API_TOKEN, query, limit);
  }
}
