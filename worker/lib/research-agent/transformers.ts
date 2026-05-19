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
    .map((edge) => {
      const post = edge.node;
      const topics =
        post.topics?.edges.map((t) => t.node.name).join(", ") || "";
      return `Product: ${post.name}\nTagline: ${post.tagline}\nURL: ${post.url}\nVotes: ${post.votesCount}\nComments: ${post.commentsCount}\nTopics: ${topics}\n---\n`;
    })
    .join("\n");
}

export function transformGitHubResponse(data: GitHubSearchResponse): string {
  if (!data.items) return "";
  return data.items
    .map(
      (repo) =>
        `Repo: ${repo.full_name}\nDesc: ${repo.description || "No description"}\nURL: ${repo.html_url}\nStars: ${repo.stargazers_count}\n---\n`,
    )
    .join("\n");
}

export function transformHackerNewsResponse(
  data: HackerNewsSearchResponse,
): string {
  if (!data.hits) return "";
  return data.hits
    .map(
      (hit) =>
        `Story: ${hit.title || "No title"}\nURL: ${hit.url || hit.objectID}\nPoints: ${hit.points}\n---\n`,
    )
    .join("\n");
}

export function transformRedditResponse(data: RedditListingResponse): string {
  if (!data.data?.children) return "";
  return data.data.children
    .map((child) => {
      const post = child.data;
      return `Post: ${post.title}\nSubreddit: r/${post.subreddit}\nURL: ${post.is_self ? "https://reddit.com" + post.permalink : post.url}\nScore: ${post.score}\n---\n`;
    })
    .join("\n");
}
