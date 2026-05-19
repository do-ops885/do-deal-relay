
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



export interface ExtractedReferral {
  code: string;
  url: string;
  source: string;
  discoveredAt: string;
  rewardSummary?: string;
  confidence: number;
  context?: string;
}

// ============================================================================
// API Fetchers
// ============================================================================

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

  const url = "https://api.producthunt.com/v2/api/graphql";
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

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(CONFIG.RESEARCH_FETCH_TIMEOUT_MS),
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
 * Transform ProductHunt response to searchable text
 */
function transformProductHuntResponse(data: ProductHuntResponse): string {
  if (!data.data?.posts?.edges) {
    return "";
  }

  const posts = data.data.posts.edges.map((edge) => edge.node);

  return posts
    .map((post) => {
      const topics =
        post.topics?.edges.map((t) => t.node.name).join(", ") || "";

      return `
Product: ${post.name}
Tagline: ${post.tagline}
URL: ${post.url}
Votes: ${post.votesCount}
Comments: ${post.commentsCount}
Topics: ${topics}
---
`;
    })
    .join("\n");
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

  const url = `https://api.github.com/search/repositories?q=${encodedQuery}&sort=stars&order=desc&per_page=${limit}`;
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

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(CONFIG.RESEARCH_FETCH_TIMEOUT_MS),
    });

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
 * Transform GitHub response to searchable text
 */
function transformGitHubResponse(data: GitHubSearchResponse): string {
  if (!data.items || data.items.length === 0) {
    return "";
  }

  return data.items
    .map((repo) => {
      return `
Repository: ${repo.full_name}
Description: ${repo.description || "No description"}
URL: ${repo.html_url}
Homepage: ${repo.homepage || "N/A"}
Stars: ${repo.stargazers_count}
Language: ${repo.language || "Unknown"}
Topics: ${repo.topics?.join(", ") || "None"}
---
`;
    })
    .join("\n");
}

/**
 * Fetch stories from Hacker News Algolia API
 */
export async function fetchHackerNewsDeals(
  searchQuery: string,
  limit: number = 50,
): Promise<FetchResult> {
  const startTime = Date.now();

  const encodedQuery = encodeURIComponent(searchQuery);
  const url = `https://hn.algolia.com/api/v1/search?query=${encodedQuery}&tags=story&hitsPerPage=${limit}`;

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

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
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
 * Transform Hacker News response to searchable text
 */
function transformHackerNewsResponse(data: HackerNewsSearchResponse): string {
  if (!data.hits || data.hits.length === 0) {
    return "";
  }

  return data.hits
    .map((hit) => {
      return `
Story: ${hit.title || "No title"}
URL: ${hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`}
Author: ${hit.author}
Points: ${hit.points}
Comments: ${hit.num_comments}
Text: ${hit.story_text || hit.comment_text || ""}
---
`;
    })
    .join("\n");
}

/**
 * OAuth token cache for Reddit
 */
let redditOAuthToken: { token: string; expiresAt: number } | null = null;

/**
 * Get Reddit OAuth token
 */
async function getRedditOAuthToken(
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
    const url = "https://www.reddit.com/api/v1/access_token";

    if (!(await validateFetchUrl(url))) {
      return null;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "DealDiscoveryBot/1.0 (by /u/dealdiscovery)",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(CONFIG.RESEARCH_FETCH_TIMEOUT_MS),
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

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "DealDiscoveryBot/1.0 (by /u/dealdiscovery)",
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
    // Use Reddit's JSON endpoint (has CORS restrictions in browsers but works in workers)
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

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "DealDiscoveryBot/1.0",
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

/**
 * Simple HTML parser to extract content
 */
function parseHtmlContent(url: string, html: string): PageContentResult {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1] ? titleMatch[1].trim() : "";

  // Extract meta description
  const metaDescMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
  );
  const description = metaDescMatch?.[1] ? metaDescMatch[1].trim() : "";

  // Extract all meta tags
  const metaTags: MetaTags = {};
  const metaRegex = /<meta[^>]*>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const tag = metaMatch[0];
    if (tag) {
      const nameMatch = tag.match(/name=["']([^"']*)["']/i);
      const contentMatch = tag.match(/content=["']([^"']*)["']/i);
      if (nameMatch?.[1] && contentMatch?.[1]) {
        metaTags[nameMatch[1]] = contentMatch[1];
      }
    }
  }

  // Remove script and style tags for text extraction
  let textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Truncate text content
  textContent = textContent.substring(0, 10000);

  // Extract links
  const links: Array<{ text: string; href: string }> = [];
  const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const href = linkMatch[1];
    const text = linkMatch[2]?.trim() ?? "";
    if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
      // Convert relative URLs to absolute
      const absoluteUrl = href.startsWith("http")
        ? href
        : new URL(href, url).toString();
      links.push({ text, href: absoluteUrl });
    }
  }

  return {
    url,
    title,
    description,
    textContent,
    links: links.slice(0, 100), // Limit links
    metaTags,
  };
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
