import { ResearchSource, PageContentResult } from "./types";
import { parseHtmlContent } from "./extractor";
import {
  fetchProductHuntDeals,
  fetchGitHubTrending,
  fetchHackerNewsDeals,
  fetchRedditDeals,
} from "./api-fetchers";
import { fetchGenericPageContent } from "./generic-fetcher";

// ============================================================================
// Real Web Fetching for Research
// ============================================================================

export interface FetchResult {
  success: boolean;
  content: string;
  contentType: string;
  statusCode: number;
  error?: string;
  fetchDurationMs: number;
}

// ============================================================================
// Source-specific Fetch Functions
// ============================================================================

/**
 * Fetch from a specific research source using the appropriate API
 */
export async function fetchFromSource(
  source: ResearchSource,
  query: string,
  apiKeys?: {
    productHuntToken?: string;
    githubToken?: string;
    redditClientId?: string;
    redditClientSecret?: string;
  },
): Promise<FetchResult> {
  const startTime = Date.now();

  // Route to appropriate API fetcher based on source
  switch (source.name) {
    case "producthunt":
      return fetchProductHuntDeals(apiKeys?.productHuntToken, query);

    case "github":
      return fetchGitHubTrending(apiKeys?.githubToken, query);

    case "hackernews":
      return fetchHackerNewsDeals(query);

    case "reddit":
      return fetchRedditDeals(
        apiKeys?.redditClientId,
        apiKeys?.redditClientSecret,
        query,
      );

    case "company_site":
      // For company sites, we need a URL to fetch
      if (source.baseUrl) {
        return fetchGenericPageContent(
          `${source.baseUrl}${source.searchPattern.replace("{query}", encodeURIComponent(query))}`,
        );
      }
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 400,
        error: "Company site requires a base URL",
        fetchDurationMs: Date.now() - startTime,
      };

    default:
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 400,
        error: `Unknown source: ${source.name}`,
        fetchDurationMs: Date.now() - startTime,
      };
  }
}

export {
  fetchProductHuntDeals,
  fetchGitHubTrending,
  fetchHackerNewsDeals,
  fetchRedditDeals,
  fetchGenericPageContent,
};
