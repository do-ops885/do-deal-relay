import { ResearchSource } from "./types";
import { validateFetchUrl } from "../security";
import { CONFIG } from "../../config";
import { parseHtmlContent } from "./extractor-utils";

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
  const safeQuery = JSON.stringify(searchQuery);
  const response = await fetchWithValidation(
    "https://api.producthunt.com/v2/api/graphql",
    CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query { posts(first: ${limit}, order: RANKING, search: {query: ${safeQuery}}) { edges { node { id name tagline url votesCount commentsCount createdAt thumbnail { url } topics { edges { node { name } } } } } } }`,
      }),
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
  if (!response.ok)
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: response.status,
      error: `ProductHunt API error: ${response.status}`,
      fetchDurationMs: Date.now() - startTime,
    };
  const data = (await response.json()) as any;
  if (data.errors)
    return {
      success: false,
      content: "",
      contentType: "application/json",
      statusCode: 200,
      error: `GraphQL error: ${data.errors.map((e: any) => e.message).join(", ")}`,
      fetchDurationMs: Date.now() - startTime,
    };
  const posts = data.data?.posts?.edges?.map((e: any) => e.node) || [];
  const content = posts
    .map(
      (p: any) =>
        `Product: ${p.name}\nTagline: ${p.tagline}\nURL: ${p.url}\nVotes: ${p.votesCount}\n---`,
    )
    .join("\n");
  return {
    success: true,
    content,
    contentType: "application/json",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
  };
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
  if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
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
  if (!response.ok)
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: response.status,
      error: `GitHub API error: ${response.status}`,
      fetchDurationMs: Date.now() - startTime,
    };
  const data = (await response.json()) as any;
  const content = (data.items || [])
    .map(
      (r: any) =>
        `Repository: ${r.full_name}\nDescription: ${r.description || ""}\nStars: ${r.stargazers_count}\nLanguage: ${r.language || "Unknown"}\n---`,
    )
    .join("\n");
  return {
    success: true,
    content,
    contentType: "application/json",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
  };
}

async function fetchHackerNewsDeals(
  searchQuery: string,
  limit = 50,
): Promise<FetchResult> {
  const startTime = Date.now();
  const response = await fetchWithValidation(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(searchQuery)}&tags=story&hitsPerPage=${limit}`,
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
  if (!response.ok)
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: response.status,
      error: `HN API error: ${response.status}`,
      fetchDurationMs: Date.now() - startTime,
    };
  const data = (await response.json()) as any;
  const content = (data.hits || [])
    .map(
      (h: any) =>
        `Story: ${h.title || ""}\nURL: ${h.url || `https://news.ycombinator.com/item?id=${h.objectID}`}\nAuthor: ${h.author}\nPoints: ${h.points}\n---`,
    )
    .join("\n");
  return {
    success: true,
    content,
    contentType: "application/json",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
  };
}

let redditOAuthToken: { token: string; expiresAt: number } | null = null;

async function getRedditOAuthToken(
  clientId: string | undefined,
  clientSecret: string | undefined,
): Promise<string | null> {
  if (!clientId || !clientSecret) return null;
  if (redditOAuthToken && redditOAuthToken.expiresAt > Date.now())
    return redditOAuthToken.token;
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
  const data = (await response.json()) as any;
  redditOAuthToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };
  return data.access_token;
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
    const response = await fetchWithValidation(
      `https://www.reddit.com/r/deals/search.json?q=${encodeURIComponent(searchQuery)}&sort=new&limit=${limit}`,
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
    if (!response.ok)
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: response.status,
        error: `Reddit API error: ${response.status}`,
        fetchDurationMs: Date.now() - startTime,
      };
    const data = (await response.json()) as any;
    const content = (data.data?.children || [])
      .map(
        (c: any) =>
          `Post: ${c.data.title}\nSubreddit: r/${c.data.subreddit}\nURL: ${c.data.url}\nScore: ${c.data.score}\n---`,
      )
      .join("\n");
    return {
      success: true,
      content,
      contentType: "application/json",
      statusCode: 200,
      fetchDurationMs: Date.now() - startTime,
    };
  }
  const response = await fetchWithValidation(
    `https://oauth.reddit.com/r/${subreddits.join("+")}/search?q=${encodeURIComponent(searchQuery)}&sort=new&limit=${limit}&raw_json=1`,
    CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
    {
      headers: {
        Authorization: `Bearer ${token}`,
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
  if (!response.ok)
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: response.status,
      error: `Reddit API error: ${response.status}`,
      fetchDurationMs: Date.now() - startTime,
    };
  const data = (await response.json()) as any;
  const content = (data.data?.children || [])
    .map(
      (c: any) =>
        `Post: ${c.data.title}\nSubreddit: r/${c.data.subreddit}\nURL: ${c.data.url}\nScore: ${c.data.score}\n---`,
    )
    .join("\n");
  return {
    success: true,
    content,
    contentType: "application/json",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
  };
}

export async function fetchGenericPageContent(
  url: string,
): Promise<
  FetchResult & { parsedContent?: ReturnType<typeof parseHtmlContent> }
> {
  const startTime = Date.now();
  if (!(await validateFetchUrl(url)))
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 403,
      error: "SSRF Blocked",
      fetchDurationMs: Date.now() - startTime,
    };
  const response = await fetch(url, {
    headers: { "User-Agent": CONFIG.USER_AGENT },
    signal: AbortSignal.timeout(CONFIG.RESEARCH_FETCH_TIMEOUT_MS),
  });
  if (!response.ok)
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: response.status,
      error: `HTTP ${response.status}`,
      fetchDurationMs: Date.now() - startTime,
    };
  const html = await response.text();
  if (html.length > CONFIG.MAX_PAYLOAD_SIZE_BYTES)
    return {
      success: false,
      content: "",
      contentType: response.headers.get("content-type") || "text/html",
      statusCode: 413,
      error: "Content exceeds size limit after reading",
      fetchDurationMs: Date.now() - startTime,
    };
  return {
    success: true,
    content: html,
    contentType: "text/html",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
    parsedContent: parseHtmlContent(url, html),
  };
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
