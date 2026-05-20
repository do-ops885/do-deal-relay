import { ResearchSource } from "./types";
import { CONFIG } from "../../config";
import type {
  ProductHuntResponse,
  GitHubSearchResponse,
  HackerNewsSearchResponse,
  RedditListingResponse,
  PageContentResult,
  MetaTags,
} from "./types";
import { validateFetchUrl } from "../security";
import { parseHtmlContent } from "./extractor-utils";
import {
  transformProductHuntResponse,
  transformGitHubResponse,
  transformHackerNewsResponse,
} from "./transformers";

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

async function fetchWithValidation(
  url: string,
  timeoutMs: number,
  options?: RequestInit,
): Promise<Response | null> {
  if (!(await validateFetchUrl(url))) return null;
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs), ...options });
}

async function fetchProductHuntDeals(
  apiToken: string | undefined,
  searchQuery: string,
  limit = 20,
): Promise<FetchResult> {
  const startTime = Date.now();
  if (!apiToken)
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 401,
      error: "ProductHunt API token not configured",
      fetchDurationMs: Date.now() - startTime,
    };

  const query = `
    query {
      posts(first: ${limit}, order: RANKING, search: {query: "${searchQuery.replace(/"/g, '\\"')}"}) {
        edges {
          node {
            id
            name
            tagline
            url
            votesCount
            commentsCount
            createdAt
            thumbnail {
              url
            }
            topics {
              edges {
                node {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetchWithValidation(
      "https://api.producthunt.com/v2/api/graphql",
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      },
    );

    if (!response)
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 403,
        error: "SSRF blocked",
        fetchDurationMs: Date.now() - startTime,
      };

    const fetchDurationMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        content: "",
        contentType: response.headers.get("content-type") || "",
        statusCode: response.status,
        error: `ProductHunt API error: ${response.status} ${response.statusText}`,
        fetchDurationMs,
      };
    }

    const data = (await response.json()) as ProductHuntResponse;

    if (data.errors) {
      return {
        success: false,
        content: "",
        contentType: "application/json",
        statusCode: 200,
        error: `GraphQL error: ${data.errors.map((e) => e.message).join(", ")}`,
        fetchDurationMs,
      };
    }

    const content = transformProductHuntResponse(data);

    return {
      success: true,
      content,
      contentType: "application/json",
      statusCode: 200,
      fetchDurationMs,
    };
  } catch (error) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 0,
      error: `ProductHunt fetch error: ${(error as Error).message}`,
      fetchDurationMs: Date.now() - startTime,
    };
  }
}

async function fetchGitHubTrending(
  apiToken: string | undefined,
  searchQuery: string,
  limit = 30,
): Promise<FetchResult> {
  const startTime = Date.now();
  const query = encodeURIComponent(
    `${searchQuery} referral OR invite OR promo`,
  );
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }

  try {
    const response = await fetchWithValidation(
      `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${limit}`,
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
      { headers },
    );

    if (!response)
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 403,
        error: "SSRF blocked",
        fetchDurationMs: Date.now() - startTime,
      };

    const fetchDurationMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        content: "",
        contentType: response.headers.get("content-type") || "",
        statusCode: response.status,
        error: `GitHub API error: ${response.status} ${response.statusText}`,
        fetchDurationMs,
      };
    }

    const data = (await response.json()) as GitHubSearchResponse;
    const content = transformGitHubResponse(data);

    return {
      success: true,
      content,
      contentType: "application/json",
      statusCode: 200,
      fetchDurationMs,
    };
  } catch (error) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 0,
      error: `GitHub fetch error: ${(error as Error).message}`,
      fetchDurationMs: Date.now() - startTime,
    };
  }
}

async function fetchHackerNewsDeals(
  searchQuery: string,
  limit = 50,
): Promise<FetchResult> {
  const startTime = Date.now();

  const encodedQuery = encodeURIComponent(searchQuery);

  try {
    const response = await fetchWithValidation(
      `https://hn.algolia.com/api/v1/search?query=${encodedQuery}&tags=story&hitsPerPage=${limit}`,
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
    );

    if (!response)
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 403,
        error: "SSRF blocked",
        fetchDurationMs: Date.now() - startTime,
      };

    const fetchDurationMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        content: "",
        contentType: response.headers.get("content-type") || "",
        statusCode: response.status,
        error: `HN API error: ${response.status} ${response.statusText}`,
        fetchDurationMs,
      };
    }

    const data = (await response.json()) as HackerNewsSearchResponse;
    const content = transformHackerNewsResponse(data);

    return {
      success: true,
      content,
      contentType: "application/json",
      statusCode: 200,
      fetchDurationMs,
    };
  } catch (error) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 0,
      error: `HN fetch error: ${(error as Error).message}`,
      fetchDurationMs: Date.now() - startTime,
    };
  }
}

let redditOAuthToken: { token: string; expiresAt: number } | null = null;

async function getRedditOAuthToken(
  clientId: string | undefined,
  clientSecret: string | undefined,
): Promise<string | null> {
  if (!clientId || !clientSecret) return null;
  if (redditOAuthToken && redditOAuthToken.expiresAt > Date.now())
    return redditOAuthToken.token;

  try {
    const response = await fetchWithValidation(
      "https://www.reddit.com/api/v1/access_token",
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "DealDiscoveryBot/1.0",
        },
        body: "grant_type=client_credentials",
      },
    );

    if (!response || !response.ok) return null;

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    redditOAuthToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };

    return data.access_token;
  } catch (error) {
    console.error(`Reddit OAuth error: ${(error as Error).message}`);
    return null;
  }
}

async function fetchRedditDeals(
  clientId: string | undefined,
  clientSecret: string | undefined,
  searchQuery: string,
  subreddits = ["deals", "referrals", "frugal"],
  limit = 25,
): Promise<FetchResult> {
  const startTime = Date.now();
  const token = await getRedditOAuthToken(clientId, clientSecret);
  if (!token) {
    // Fallback to public RSS-like endpoint (limited functionality)
    return fetchRedditPublic(searchQuery, limit);
  }

  try {
    // Search across multiple subreddits
    const subredditQuery = subreddits.join("+");

    const response = await fetchWithValidation(
      `https://oauth.reddit.com/r/${subredditQuery}/search?q=${encodeURIComponent(searchQuery)}&sort=new&limit=${limit}&raw_json=1`,
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "DealDiscoveryBot/1.0 (by /u/dealdiscovery)",
        },
      },
    );

    if (!response)
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 403,
        error: "SSRF blocked",
        fetchDurationMs: Date.now() - startTime,
      };

    const fetchDurationMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        content: "",
        contentType: response.headers.get("content-type") || "",
        statusCode: response.status,
        error: `Reddit API error: ${response.status} ${response.statusText}`,
        fetchDurationMs,
      };
    }

    const data = (await response.json()) as RedditListingResponse;
    const content = transformRedditResponse(data);

    return {
      success: true,
      content,
      contentType: "application/json",
      statusCode: 200,
      fetchDurationMs,
    };
  } catch (error) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 0,
      error: `Reddit fetch error: ${(error as Error).message}`,
      fetchDurationMs: Date.now() - startTime,
    };
  }
}

/**
 * Fallback public Reddit fetch (no OAuth required, limited)
 */
async function fetchRedditPublic(
  searchQuery: string,
  limit: number,
): Promise<FetchResult> {
  const startTime = Date.now();

  try {
    const response = await fetchWithValidation(
      `https://www.reddit.com/r/deals/search.json?q=${encodeURIComponent(searchQuery)}&sort=new&limit=${limit}`,
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "DealDiscoveryBot/1.0",
        },
      },
    );

    if (!response)
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 403,
        error: "SSRF blocked",
        fetchDurationMs: Date.now() - startTime,
      };

    const fetchDurationMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        content: "",
        contentType: response.headers.get("content-type") || "",
        statusCode: response.status,
        error: `Reddit public API error: ${response.status}`,
        fetchDurationMs,
      };
    }

    const data = (await response.json()) as RedditListingResponse;
    const content = transformRedditResponse(data);

    return {
      success: true,
      content,
      contentType: "application/json",
      statusCode: 200,
      fetchDurationMs,
    };
  } catch (error) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 0,
      error: `Reddit public fetch error: ${(error as Error).message}`,
      fetchDurationMs: Date.now() - startTime,
    };
  }
}

/**
 * Transform Reddit response to searchable text
 */
function transformRedditResponse(data: RedditListingResponse): string {
  if (!data.data?.children || data.data.children.length === 0) {
    return "";
  }

  return data.data.children
    .map((child) => {
      const post = child.data;
      return `
Post: ${post.title}
Subreddit: r/${post.subreddit}
Author: u/${post.author}
URL: ${post.is_self ? `https://reddit.com${post.permalink}` : post.url}
Score: ${post.score}
Comments: ${post.num_comments}
Text: ${post.selftext?.substring(0, 500) || ""}
---
`;
    })
    .join("\n");
}

/**
 * Fetch content from a generic URL with HTML parsing
 */
export async function fetchGenericPageContent(
  url: string,
): Promise<FetchResult & { parsedContent?: PageContentResult }> {
  const startTime = Date.now();

  if (!(await validateFetchUrl(url)))
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 403,
      error: "SSRF blocked",
      fetchDurationMs: Date.now() - startTime,
    };
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      },
      signal: AbortSignal.timeout(CONFIG.RESEARCH_FETCH_TIMEOUT_MS),
    });

    const fetchDurationMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        content: "",
        contentType: response.headers.get("content-type") || "",
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
        fetchDurationMs,
      };
    }

    const contentType = response.headers.get("content-type") || "text/html";
    // HTML scraping: Content size is bounded by CONFIG.MAX_PAYLOAD_SIZE_BYTES check below.
    // Using response.text() is acceptable here as we need the full HTML for parsing.
    const html = await response.text();

    // Validate content size after reading
    if (html.length > CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
      return {
        success: false,
        content: "",
        contentType,
        statusCode: 200,
        error: "Content exceeds size limit after reading",
        fetchDurationMs,
      };
    }

    // Parse HTML to extract relevant content
    const parsed = parseHtmlContent(url, html);

    return {
      success: true,
      content: html,
      contentType,
      statusCode: 200,
      fetchDurationMs,
      parsedContent: parsed,
    };
  } catch (error) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 0,
      error: `Fetch error: ${(error as Error).message}`,
      fetchDurationMs: Date.now() - startTime,
    };
  }
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
