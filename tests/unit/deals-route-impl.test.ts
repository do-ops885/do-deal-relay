import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetDeals, handleSimilarDeals, handleRankedDeals, handleDealHighlights, handleExplainDeal } from "../../worker/routes/core/deals";
import * as storage from "../../worker/lib/storage";
import { jsonResponse } from "../../worker/routes/utils";

vi.mock("../../worker/lib/storage", () => ({
  getProductionSnapshot: vi.fn(),
}));

// Mock jsonResponse to just return a real Response-like object
vi.mock("../../worker/routes/utils", () => ({
  jsonResponse: vi.fn((data, status) => ({
    status: status || 200,
    data,
    json: async () => data
  })),
}));

describe("deals-route", () => {
  const mockEnv = {} as any;
  const mockSnapshot = {
    version: "1.0.0",
    deals: [
      {
        id: "1",
        code: "DEAL1",
        title: "Deal 1",
        source: { domain: "example.com", discovered_at: new Date().toISOString() },
        reward: { value: 50, type: "cash" },
        expiry: { date: new Date(Date.now() + 86400000).toISOString(), confidence: 0.9 },
        metadata: { status: "active", category: ["finance"], tags: ["tag1"] },
      },
      {
        id: "2",
        code: "DEAL2",
        title: "Deal 2",
        source: { domain: "other.com", discovered_at: new Date().toISOString() },
        reward: { value: 100, type: "cash" },
        expiry: { date: new Date(Date.now() + 86400000).toISOString(), confidence: 0.9 },
        metadata: { status: "active", category: ["shopping"], tags: ["tag2"] },
      },
      {
        id: "3",
        code: "DEAL3",
        title: "Deal 3",
        source: { domain: "example.com", discovered_at: new Date().toISOString() },
        reward: { value: 10, type: "cash" },
        expiry: { date: new Date(Date.now() + 86400000).toISOString(), confidence: 0.9 },
        metadata: { status: "rejected", category: ["finance"], tags: ["tag3"] },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (storage.getProductionSnapshot as any).mockResolvedValue(mockSnapshot);
  });

  describe("handleGetDeals", () => {
    it("should return all active deals", async () => {
      const url = new URL("http://localhost/deals");
      const response = (await handleGetDeals(url, mockEnv)) as any;

      expect(response.status).toBe(200);
      expect(response.data).toHaveLength(2); // Only active deals
    });

    it("should filter by category", async () => {
      const url = new URL("http://localhost/deals?category=finance");
      const response = (await handleGetDeals(url, mockEnv)) as any;

      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe("1");
    });

    it("should filter by min_reward", async () => {
      const url = new URL("http://localhost/deals?min_reward=60");
      const response = (await handleGetDeals(url, mockEnv)) as any;

      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe("2");
    });

    it("should return full snapshot for .json extension", async () => {
      const url = new URL("http://localhost/deals.json");
      const response = (await handleGetDeals(url, mockEnv)) as any;

      expect(response.data.version).toBe("1.0.0");
      expect(response.data.deals).toHaveLength(2);
    });

    it("should return 404 if no snapshot found", async () => {
      (storage.getProductionSnapshot as any).mockResolvedValue(null);
      const url = new URL("http://localhost/deals");
      const response = (await handleGetDeals(url, mockEnv)) as any;

      expect(response.status).toBe(404);
    });
  });

  describe("handleSimilarDeals", () => {
    it("should return similar deals by category", async () => {
      const url = new URL("http://localhost/deals/similar?code=DEAL1");
      const response = (await handleSimilarDeals(url, mockEnv)) as any;

      expect(response.status).toBe(200);
      expect(response.data.reference.code).toBe("DEAL1");
      // Other active deal is DEAL2, but DEAL1 is finance and DEAL2 is shopping.
      // However, it might still return it if there's any similarity or just as fallback
      // In this case, categories are different, domains are different.
    });

    it("should return 400 if no code or domain provided", async () => {
      const url = new URL("http://localhost/deals/similar");
      const response = (await handleSimilarDeals(url, mockEnv)) as any;

      expect(response.status).toBe(400);
    });
  });

  describe("handleRankedDeals", () => {
    it("should return ranked deals", async () => {
      const url = new URL("http://localhost/deals/ranked");
      const response = (await handleRankedDeals(url, mockEnv)) as any;

      expect(response.status).toBe(200);
      expect(response.data.deals).toBeDefined();
    });
  });

  describe("handleDealHighlights", () => {
    it("should return highlights", async () => {
      const url = new URL("http://localhost/deals/highlights");
      const response = (await handleDealHighlights(url, mockEnv)) as any;

      expect(response.status).toBe(200);
      expect(response.data.top_deals).toBeDefined();
      expect(response.data.expiring_soon).toBeDefined();
      expect(response.data.recently_added).toBeDefined();
    });
  });

  describe("handleExplainDeal", () => {
    it("should explain a deal", async () => {
      const response = (await handleExplainDeal("1", mockEnv)) as any;

      expect(response.status).toBe(200);
      expect(response.data.summary).toBeDefined();
    });

    it("should return 404 if deal not found", async () => {
      const response = (await handleExplainDeal("nonexistent", mockEnv)) as any;

      expect(response.status).toBe(404);
    });
  });
});
