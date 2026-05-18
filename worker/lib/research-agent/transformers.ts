import type {
  ProductHuntResponse,
  GitHubSearchResponse,
  HackerNewsSearchResponse,
  RedditListingResponse,
} from "./types";

/**
 * Transform ProductHunt response to searchable text
 */
export function transformProductHuntResponse(
  data: ProductHuntResponse,
): string {
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
 * Transform GitHub response to searchable text
 */
export function transformGitHubResponse(data: GitHubSearchResponse): string {
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
 * Transform Hacker News response to searchable text
 */
export function transformHackerNewsResponse(
  data: HackerNewsSearchResponse,
): string {
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
 * Transform Reddit response to searchable text
 */
export function transformRedditResponse(data: RedditListingResponse): string {
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
