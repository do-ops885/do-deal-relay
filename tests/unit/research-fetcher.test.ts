import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchProductHuntDeals,
  fetchGitHubTrending,
  fetchHackerNewsDeals,
  fetchRedditDeals,
} from "../../worker/lib/research-agent/fetcher";

describe("Research Agent Fetcher", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("fetchProductHuntDeals", () => {
    it("should return 401 if token is missing", async () => {
      const result = await fetchProductHuntDeals(undefined, "query");
      expect(result.statusCode).toBe(401);
    });

    it("should call GraphQL API with token", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: { posts: { nodes: [] } } }),
      };
      (fetch as any).mockResolvedValue(mockResponse);

      const result = await fetchProductHuntDeals("test-token", "test-query");
      expect(fetch).toHaveBeenCalledWith(
        "https://api.producthunt.com/v2/api/graphql",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("fetchGitHubTrending", () => {
    it("should call GitHub search API", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ items: [] }),
      };
      (fetch as any).mockResolvedValue(mockResponse);

      const result = await fetchGitHubTrending("gh-token", "search");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.github.com/search/repositories"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer gh-token",
          }),
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("fetchHackerNewsDeals", () => {
    it("should call Algolia search API", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ hits: [] }),
      };
      (fetch as any).mockResolvedValue(mockResponse);

      const result = await fetchHackerNewsDeals("startup");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("hn.algolia.com/api/v1/search"),
        expect.any(Object),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("fetchRedditDeals", () => {
    it("should call Reddit search API (public fallback)", async () => {
      const mockResponse = {
        ok: true,
        text: async () => "[]",
      };
      (fetch as any).mockResolvedValue(mockResponse);

      await fetchRedditDeals(undefined, undefined, "deals");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("www.reddit.com/r/deals/search.json"),
        expect.any(Object),
      );
    });
  });
});
