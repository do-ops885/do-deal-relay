import { CONFIG } from "../../config";
import { validateFetchUrl, validateUrl, validatedFetch } from "../security";
import type {
  ProductHuntResponse,
  GitHubSearchResponse,
  HackerNewsSearchResponse,
} from "./types";
import type { FetchResult } from "./types";

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
      posts(first: ${limit}, order: RANKING, search: {query: "${searchQuery.replace(/[\\"]/g, "\\$&")}"}) {
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
    const response = await validatedFetch(url, {
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

export async function fetchGitHubTrending(
  apiToken: string | undefined,
  searchQuery: string,
  limit: number = 30,
): Promise<FetchResult> {
  const startTime = Date.now();

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
    const response = await validatedFetch(url, {
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

    const response = await validatedFetch(url, {
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
