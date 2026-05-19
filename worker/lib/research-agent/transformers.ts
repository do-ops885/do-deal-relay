import {
  ProductHuntResponse,
  GitHubSearchResponse,
  HackerNewsSearchResponse,
  RedditListingResponse,
} from "./types";

export function transformProductHuntResponse(
  data: ProductHuntResponse,
): string {
  if (!data.data?.posts?.edges) return "";
  return data.data.posts.edges
    .map((e) => `Product: ${e.node.name}\nURL: ${e.node.url}`)
    .join("\n---\n");
}

export function transformGitHubResponse(data: GitHubSearchResponse): string {
  if (!data.items) return "";
  return data.items
    .map((item) => `Repo: ${item.full_name}\nURL: ${item.html_url}`)
    .join("\n---\n");
}

export function transformHackerNewsResponse(
  data: HackerNewsSearchResponse,
): string {
  if (!data.hits) return "";
  return data.hits
    .map((h) => `Story: ${h.title}\nURL: ${h.url || h.objectID}`)
    .join("\n---\n");
}

export function transformRedditResponse(data: RedditListingResponse): string {
  if (!data.data?.children) return "";
  return data.data.children
    .map((c) => `Post: ${c.data.title}\nURL: ${c.data.url}`)
    .join("\n---\n");
}
