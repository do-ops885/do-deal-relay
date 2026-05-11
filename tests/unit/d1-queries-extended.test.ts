import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchDeals,
  getSearchSuggestions,
  getDealsByDomain,
  getDealsByCategory,
  getDomainsWithCounts,
  getCategoriesWithCounts,
} from "../../worker/lib/d1/queries";
import type { D1Database } from "@cloudflare/workers-types";

// Mock D1 Client
vi.mock("../../worker/lib/d1/client", () => {
  const mockClient = {
    query: vi.fn(),
    queryWithJson: vi.fn(),
  };
  return {
    createD1ReadClient: () => mockClient,
    createD1WriteClient: () => mockClient,
  };
});

import { createD1ReadClient } from "../../worker/lib/d1/client";

describe("D1 Queries Extended", () => {
  const mockDb = {} as D1Database;
  const mockClient = createD1ReadClient(mockDb);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchDeals", () => {
    it("should call queryWithJson with correct SQL and params", async () => {
      (mockClient.queryWithJson as any).mockResolvedValue({
        success: true,
        data: [],
      });

      await searchDeals(mockDb, "test query", { limit: 10, status: "active" });

      expect(mockClient.queryWithJson).toHaveBeenCalledWith(
        expect.stringContaining("MATCH ?"),
        expect.arrayContaining(["test query", "active", 10]),
        ["category", "tags"],
      );
    });
  });

  describe("getSearchSuggestions", () => {
    it("should return titles from query results", async () => {
      (mockClient.query as any).mockResolvedValue({
        success: true,
        data: [{ title: "Deal 1" }, { title: "Deal 2" }],
      });

      const suggestions = await getSearchSuggestions(mockDb, "de");

      expect(suggestions).toEqual(["Deal 1", "Deal 2"]);
    });
  });

  describe("getDealsByDomain", () => {
    it("should filter by domain", async () => {
      (mockClient.queryWithJson as any).mockResolvedValue({
        success: true,
        data: [],
      });

      await getDealsByDomain(mockDb, "example.com");

      expect(mockClient.queryWithJson).toHaveBeenCalledWith(
        expect.stringContaining("WHERE domain = ?"),
        ["example.com", 50],
        ["category", "tags"],
      );
    });
  });

  describe("getDealsByCategory", () => {
    it("should filter by category using JSON path", async () => {
      (mockClient.queryWithJson as any).mockResolvedValue({
        success: true,
        data: [],
      });

      await getDealsByCategory(mockDb, "finance");

      expect(mockClient.queryWithJson).toHaveBeenCalledWith(
        expect.stringContaining("json_extract(category, '$') LIKE ?"),
        expect.arrayContaining(['%"finance"%', "%finance%", 1, 50]),
        ["category", "tags"],
      );
    });
  });

  describe("getDomainsWithCounts", () => {
    it("should return domains grouped by count", async () => {
      (mockClient.query as any).mockResolvedValue({
        success: true,
        data: [{ domain: "a.com", count: 5 }],
      });

      const results = await getDomainsWithCounts(mockDb);
      expect(results).toEqual([{ domain: "a.com", count: 5 }]);
    });
  });

  describe("getCategoriesWithCounts", () => {
    it("should parse JSON categories and count them", async () => {
      (mockClient.query as any).mockResolvedValue({
        success: true,
        data: [
          { categories: '["finance", "shopping"]' },
          { categories: '["finance", "travel"]' },
        ],
      });

      const results = await getCategoriesWithCounts(mockDb);

      const finance = results.find((r) => r.name === "finance");
      expect(finance?.count).toBe(2);
    });
  });
});
