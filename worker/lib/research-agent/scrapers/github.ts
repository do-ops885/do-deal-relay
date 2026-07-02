// GitHub Trending Scraper
// ============================================================================
//
// Real implementation backed by the GitHub REST Search API.
// Reuses fetchGitHubTrending — only adds Scraper interface conformance.

import { fetchGitHubTrending } from "../api-fetchers";
import type { FetchResult } from "../types";
import {
  type Scraper,
  type ScraperEnv,
  type SourceName,
} from "./base";

export class GitHubScraper implements Scraper {
  readonly name: SourceName = "github";

  isReady(_env: ScraperEnv): boolean {
    // GitHub search works without auth (60/hr) — token boosts to 5000/hr.
    return true;
  }

  async scrape(
    env: ScraperEnv,
    query: string,
    limit: number = 30,
  ): Promise<FetchResult> {
    return fetchGitHubTrending(env.GITHUB_API_TOKEN, query, limit);
  }
}
