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
import { CONFIG } from "../../config";
import { validateFetchUrl } from "../security";

export async function fetchProductHuntDeals(
  apiToken: string | undefined,
  searchQuery: string,
  limit: number = 20,
): Promise<any> {
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
  const query = `query { posts(first: ${limit}, search: {query: "${searchQuery.replace(/"/g, '\\"')}"}) { edges { node { id name tagline url votesCount commentsCount topics { edges { node { name } } } } } } }`;
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
    body: JSON.stringify({ query }),
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
): Promise<any> {
  const startTime = Date.now();
  const url =
    "https://api.github.com/search/repositories?q=" +
    encodeURIComponent(searchQuery) +
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
  const headers: any = { Accept: "application/vnd.github+json" };
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
): Promise<any> {
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

export async function fetchRedditDeals(
  clientId: string | undefined,
  clientSecret: string | undefined,
  searchQuery: string,
  limit: number = 25,
): Promise<any> {
  const startTime = Date.now();
  const url =
    "https://www.reddit.com/r/deals/search.json?q=" +
    encodeURIComponent(searchQuery) +
    "&limit=" +
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
  const response = await fetch(url, {
    headers: { "User-Agent": "DealDiscoveryBot/1.0" },
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
