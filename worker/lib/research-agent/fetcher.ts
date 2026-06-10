import { ResearchSource, type FetchResult } from "./types";
import {
  fetchProductHuntDeals,
  fetchGitHubTrending,
  fetchHackerNewsDeals,
} from "./api-fetchers";
import { fetchRedditDeals } from "./reddit-fetcher";
import { fetchGenericPageContent } from "./page-fetcher";
import { extractReferralsFromContent as _extractReferralsFromContent } from "./referral-extractor";
import {
  ResearchRateLimiter,
  researchRateLimiter as _researchRateLimiter,
} from "./rate-limiter";

export type { FetchResult, ExtractedReferral } from "./types";

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

export const extractReferralsFromContent = _extractReferralsFromContent;
export const researchRateLimiter = _researchRateLimiter;
export { ResearchRateLimiter };

export {
  fetchProductHuntDeals,
  fetchGitHubTrending,
  fetchHackerNewsDeals,
  fetchRedditDeals,
  fetchGenericPageContent,
};
