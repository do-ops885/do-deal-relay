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
import { validateFetchUrl } from "../security";
import { FetchResult } from "./fetcher";

export async function fetchProductHuntDeals(
  apiToken: string | undefined,
  searchQuery: string,
  limit: number = 20,
): Promise<FetchResult> {
  const startTime = Date.now();
  if (!apiToken)
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 401,
      error: "Missing token",
      fetchDurationMs: 0,
    };
  const query = `query ($limit: Int!, $query: String!) { posts(first: $limit, order: RANKING, search: {query: $query}) { edges { node { id name tagline url votesCount commentsCount topics { edges { node { name } } } createdAt thumbnail { url } } } } }`;
  const variables = { limit, query: searchQuery };
  const url = "https://api.producthunt.com/v2/api/graphql";
  if (!(await validateFetchUrl(url)))
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 403,
      error: "SSRF Blocked",
      fetchDurationMs: 0,
    };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await response.json()) as ProductHuntResponse;
  return {
    success: true,
    content: transformProductHuntResponse(data),
    contentType: "application/json",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
  };
}

export async function fetchGitHubTrending(
  apiToken: string | undefined,
  searchQuery: string,
  limit: number = 30,
): Promise<FetchResult> {
  const startTime = Date.now();
  const enhancedQuery = searchQuery + " referral OR invite OR promo";
  const url =
    "https://api.github.com/search/repositories?q=" +
    encodeURIComponent(enhancedQuery) +
    "&per_page=" +
    limit;
  if (!(await validateFetchUrl(url)))
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 403,
      error: "SSRF Blocked",
      fetchDurationMs: 0,
    };
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "DealDiscoveryBot/1.0",
  };
  if (apiToken) headers.Authorization = "Bearer " + apiToken;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const data = (await response.json()) as GitHubSearchResponse;
  return {
    success: true,
    content: transformGitHubResponse(data),
    contentType: "application/json",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
  };
}

export async function fetchHackerNewsDeals(
  searchQuery: string,
  limit: number = 50,
): Promise<FetchResult> {
  const startTime = Date.now();
  const url =
    "https://hn.algolia.com/api/v1/search?query=" +
    encodeURIComponent(searchQuery) +
    "&hitsPerPage=" +
    limit;
  if (!(await validateFetchUrl(url)))
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 403,
      error: "SSRF Blocked",
      fetchDurationMs: 0,
    };
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = (await response.json()) as HackerNewsSearchResponse;
  return {
    success: true,
    content: transformHackerNewsResponse(data),
    contentType: "application/json",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
  };
}

async function getRedditAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  try {
    const auth = btoa(`${clientId}:${clientSecret}`);
    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "DealDiscoveryBot/1.0",
      },
      body: "grant_type=client_credentials",
    });
    const data = (await response.json()) as { access_token?: string };
    return data.access_token || null;
  } catch (e) {
    return null;
  }
}

export async function fetchRedditDeals(
  clientId: string | undefined,
  clientSecret: string | undefined,
  searchQuery: string,
  limit: number = 25,
): Promise<FetchResult> {
  const startTime = Date.now();
  let url =
    "https://www.reddit.com/r/deals/search.json?q=" +
    encodeURIComponent(searchQuery) +
    "&limit=" +
    limit;
  const headers: Record<string, string> = {
    "User-Agent": "DealDiscoveryBot/1.0",
  };

  if (clientId && clientSecret) {
    const token = await getRedditAccessToken(clientId, clientSecret);
    if (token) {
      url =
        "https://oauth.reddit.com/r/deals/search?q=" +
        encodeURIComponent(searchQuery) +
        "&limit=" +
        limit;
      headers.Authorization = `Bearer ${token}`;
    }
  }

  if (!(await validateFetchUrl(url)))
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 403,
      error: "SSRF Blocked",
      fetchDurationMs: 0,
    };
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const data = (await response.json()) as RedditListingResponse;
  return {
    success: true,
    content: transformRedditResponse(data),
    contentType: "application/json",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
  };
}
