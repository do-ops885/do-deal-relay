import { CONFIG } from "../../config";
import { validateFetchUrl, validateUrl, validatedFetch } from "../security";
import { createTimeoutSignal } from "../utils";
import type { RedditListingResponse } from "./types";
import type { FetchResult } from "./types";

let redditOAuthToken: { token: string; expiresAt: number } | null = null;

async function getRedditOAuthToken(
  clientId: string | undefined,
  clientSecret: string | undefined,
): Promise<string | null> {
  if (!clientId || !clientSecret) {
    return null;
  }

  if (redditOAuthToken && redditOAuthToken.expiresAt > Date.now()) {
    return redditOAuthToken.token;
  }

  try {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const url = "https://www.reddit.com/api/v1/access_token";

    if (!(await validateFetchUrl(url))) {
      return null;
    }

    const { signal, cleanup } = createTimeoutSignal(
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
    );
    const response = await validatedFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "DealDiscoveryBot/1.0 (by /u/dealdiscovery)",
      },
      body: "grant_type=client_credentials",
      signal,
    });
    cleanup();

    if (!response.ok) {
      console.error(`Reddit OAuth error: ${response.status}`);
      return null;
    }

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
    return fetchRedditPublic(searchQuery, limit);
  }

  try {
    const subredditQuery = subreddits.join("+");
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://oauth.reddit.com/r/${subredditQuery}/search?q=${encodedQuery}&sort=new&limit=${limit}&raw_json=1`;

    if (!(await validateFetchUrl(url))) {
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 403,
        error: "Blocked by SSRF protection",
        fetchDurationMs: Date.now() - startTime,
      };
    }

    const { signal, cleanup } = createTimeoutSignal(
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
    );
    const response = await validatedFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "DealDiscoveryBot/1.0 (by /u/dealdiscovery)",
      },
      signal,
    });
    cleanup();

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

async function fetchRedditPublic(
  searchQuery: string,
  limit: number,
): Promise<FetchResult> {
  const startTime = Date.now();

  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://www.reddit.com/r/deals/search.json?q=${encodedQuery}&sort=new&limit=${limit}`;

    if (!(await validateFetchUrl(url))) {
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 403,
        error: "Blocked by SSRF protection",
        fetchDurationMs: Date.now() - startTime,
      };
    }

    if (!validateUrl(url)) {
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 403,
        error: "Invalid or disallowed URL",
        fetchDurationMs: Date.now() - startTime,
      };
    }

    const { signal, cleanup } = createTimeoutSignal(
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
    );
    const response = await validatedFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "DealDiscoveryBot/1.0",
      },
      signal,
    });
    cleanup();

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
