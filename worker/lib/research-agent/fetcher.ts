import { ResearchSource } from "./types";
import {
  fetchProductHuntDeals,
  fetchGitHubTrending,
  fetchHackerNewsDeals,
  fetchRedditDeals,
} from "./api-fetchers";
import { fetchGenericPageContent } from "./generic-fetcher";
import {
  ExtractedReferral,
  extractReferralsFromContent,
} from "./extractor-logic";
import { researchRateLimiter } from "./rate-limiter";

export interface FetchResult {
  success: boolean;
  content: string;
  contentType: string;
  statusCode: number;
  error?: string;
  fetchDurationMs: number;
}

export async function fetchFromSource(
  source: ResearchSource,
  query: string,
  apiKeys?: any,
): Promise<FetchResult> {
  const startTime = Date.now();
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
      if (source.baseUrl)
        return fetchGenericPageContent(source.baseUrl + query);
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 400,
        error: "No base URL",
        fetchDurationMs: Date.now() - startTime,
      };
    default:
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 400,
        error: "Unknown source",
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
  ExtractedReferral,
  extractReferralsFromContent,
  researchRateLimiter,
};
