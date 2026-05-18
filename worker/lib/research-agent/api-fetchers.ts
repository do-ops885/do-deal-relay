import { FetchResult } from "./fetcher";
import {
  ProductHuntResponse,
  GitHubSearchResponse,
  HackerNewsSearchResponse,
  RedditListingResponse,
} from "./types";
import {
  transformProductHuntResponse,
  transformGitHubResponse,
  transformHackerNewsResponse,
  transformRedditResponse,
} from "./transformers";

/**
 * Fetch deals from ProductHunt GraphQL API
 */
export async function fetchProductHuntDeals(
  apiToken: string | undefined,
  searchQuery: string,
  limit: number = 20,
): Promise<FetchResult> {
  const startTime = Date.now();

  if (!apiToken) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 401,
      error: "ProductHunt API token not configured",
      fetchDurationMs: Date.now() - startTime,
    };
  }

  const query = `
    query($limit: Int!, $searchQuery: String!) {
      posts(first: $limit, order: RANKING, search: {query: $searchQuery}) {
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
    const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables: { limit, searchQuery } }),
      signal: AbortSignal.timeout(10000),
    });

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

    // Transform to searchable text format
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

/**
 * Fetch trending repositories from GitHub Search API
 */
export async function fetchGitHubTrending(
  apiToken: string | undefined,
  searchQuery: string,
  limit: number = 30,
): Promise<FetchResult> {
  const startTime = Date.now();

  // Build search query with referral-related terms
  const query = `${searchQuery} referral OR invite OR promo`;
  const encodedQuery = encodeURIComponent(query);

  const headers: { [key: string]: string } = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }

  try {
    const response = await fetch(
      `https://api.github.com/search/repositories?q=${encodedQuery}&sort=stars&order=desc&per_page=${limit}`,
      {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10000),
      },
    );

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

/**
 * Fetch stories from Hacker News Algolia API
 */
export async function fetchHackerNewsDeals(
  searchQuery: string,
  limit: number = 50,
): Promise<FetchResult> {
  const startTime = Date.now();

  try {
    // Use URL constructor to safely build the request URL and prevent SSRF
    const requestUrl = new URL("https://hn.algolia.com/api/v1/search");
    requestUrl.searchParams.set("query", searchQuery);
    requestUrl.searchParams.set("tags", "story");
    requestUrl.searchParams.set("hitsPerPage", String(limit));

    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

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

/**
 * OAuth token cache for Reddit
 */
let redditOAuthToken: { token: string; expiresAt: number } | null = null;

/**
 * Get Reddit OAuth token
 */
export async function getRedditOAuthToken(
  clientId: string | undefined,
  clientSecret: string | undefined,
): Promise<string | null> {
  if (!clientId || !clientSecret) {
    return null;
  }

  // Check if we have a valid cached token
  if (redditOAuthToken && redditOAuthToken.expiresAt > Date.now()) {
    return redditOAuthToken.token;
  }

  try {
    const credentials = btoa(`${clientId}:${clientSecret}`);

    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "DealDiscoveryBot/1.0 (by /u/dealdiscovery)",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`Reddit OAuth error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    // Cache token with 5 minute buffer before expiry
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

/**
 * Fetch posts from Reddit API
 */
export async function fetchRedditDeals(
  clientId: string | undefined,
  clientSecret: string | undefined,
  searchQuery: string,
  subreddits: string[] = ["deals", "referrals", "frugal"],
  limit: number = 25,
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

    // Use URL constructor to safely build the request URL and prevent SSRF
    const requestUrl = new URL(
      `https://oauth.reddit.com/r/${subredditQuery}/search`,
    );
    requestUrl.searchParams.set("q", searchQuery);
    requestUrl.searchParams.set("sort", "new");
    requestUrl.searchParams.set("limit", String(limit));
    requestUrl.searchParams.set("raw_json", "1");

    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "DealDiscoveryBot/1.0 (by /u/dealdiscovery)",
      },
      signal: AbortSignal.timeout(10000),
    });

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
export async function fetchRedditPublic(
  searchQuery: string,
  limit: number,
): Promise<FetchResult> {
  const startTime = Date.now();

  try {
    // Use Reddit's JSON endpoint (has CORS restrictions in browsers but works in workers)
    // Use URL constructor to safely build the request URL and prevent SSRF
    const requestUrl = new URL("https://www.reddit.com/r/deals/search.json");
    requestUrl.searchParams.set("q", searchQuery);
    requestUrl.searchParams.set("sort", "new");
    requestUrl.searchParams.set("limit", String(limit));

    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "DealDiscoveryBot/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });

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
