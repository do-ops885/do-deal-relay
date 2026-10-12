import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleGetDeals,
  handleSimilarDeals,
  handleRankedDeals,
  handleDealHighlights,
  handleExplainDeal,
} from "../../worker/routes/core/deals";
import * as storage from "../../worker/lib/storage";
import type { Env, Snapshot } from "../../worker/types";
import { jsonRecord, recordArray } from "../fixtures/typed-assert";

interface MockJsonResponse {
  status: number;
  data: unknown;
  json: () => Promise<unknown>;
}

vi.mock("../../worker/lib/storage", () => ({
  getProductionSnapshot: vi.fn(),
}));

// Mock jsonResponse to just return a real Response-like object
vi.mock("../../worker/routes/utils", () => ({
  jsonResponse: vi.fn((data, status) => ({
    status: status || 200,
    data,
    json: async () => data,
  })),
}));

describe("deals-route", () => {
  const mockEnv = {} as unknown as Env;
  const mockSnapshot: Snapshot = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    run_id: "test-run",
    trace_id: "test-trace",
    snapshot_hash: "test-hash",
    previous_hash: "prev-hash",
    schema_version: "1.0.0",
    stats: {
      total: 3,
      active: 2,
      quarantined: 0,
      rejected: 1,
      duplicates: 0,
    },
    deals: [
      {
        id: "1",
        code: "DEAL1",
        title: "Deal 1",
        description: "Deal 1 description",
        url: "https://example.com/deal1",
        source: {
          url: "https://example.com/deal1",
          domain: "example.com",
          discovered_at: new Date().toISOString(),
          trust_score: 0.9,
        },
        reward: { value: 50, type: "cash" },
        expiry: {
          date: new Date(Date.now() + 86400000).toISOString(),
          confidence: 0.9,
          type: "hard",
        },
        metadata: {
          status: "active",
          category: ["finance"],
          tags: ["tag1"],
          normalized_at: new Date().toISOString(),
          confidence_score: 0.9,
        },
      },
      {
        id: "2",
        code: "DEAL2",
        title: "Deal 2",
        description: "Deal 2 description",
        url: "https://other.com/deal2",
        source: {
          url: "https://other.com/deal2",
          domain: "other.com",
          discovered_at: new Date().toISOString(),
          trust_score: 0.9,
        },
        reward: { value: 100, type: "cash" },
        expiry: {
          date: new Date(Date.now() + 86400000).toISOString(),
          confidence: 0.9,
          type: "hard",
        },
        metadata: {
          status: "active",
          category: ["shopping"],
          tags: ["tag2"],
          normalized_at: new Date().toISOString(),
          confidence_score: 0.9,
        },
      },
      {
        id: "3",
        code: "DEAL3",
        title: "Deal 3",
        description: "Deal 3 description",
        url: "https://example.com/deal3",
        source: {
          url: "https://example.com/deal3",
          domain: "example.com",
          discovered_at: new Date().toISOString(),
          trust_score: 0.9,
        },
        reward: { value: 10, type: "cash" },
        expiry: {
          date: new Date(Date.now() + 86400000).toISOString(),
          confidence: 0.9,
          type: "hard",
        },
        metadata: {
          status: "rejected",
          category: ["finance"],
          tags: ["tag3"],
          normalized_at: new Date().toISOString(),
          confidence_score: 0.9,
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getProductionSnapshot).mockResolvedValue(mockSnapshot);
  });

  describe("handleGetDeals", () => {
    it("should return all active deals", async () => {
      const url = new URL("http://localhost/deals");
      const response = (await handleGetDeals(
        url,
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.status).toBe(200);
      expect(response.data).toHaveLength(2); // Only active deals
    });

    it("should filter by category", async () => {
      const url = new URL("http://localhost/deals?category=finance");
      const response = (await handleGetDeals(
        url,
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.data).toHaveLength(1);
      const deals = recordArray(response.data);
      expect(deals[0]?.id).toBe("1");
    });

    it("should filter by min_reward", async () => {
      const url = new URL("http://localhost/deals?min_reward=60");
      const response = (await handleGetDeals(
        url,
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.data).toHaveLength(1);
      const deals = recordArray(response.data);
      expect(deals[0]?.id).toBe("2");
    });

    it("should return full snapshot for .json extension", async () => {
      const url = new URL("http://localhost/deals.json");
      const response = (await handleGetDeals(
        url,
        mockEnv,
      )) as unknown as MockJsonResponse;

      const body = jsonRecord(response.data);
      expect(body.version).toBe("1.0.0");
      expect(body.deals).toHaveLength(2);
    });

    it("should return 404 if no snapshot found", async () => {
      vi.mocked(storage.getProductionSnapshot).mockResolvedValue(null);
      const url = new URL("http://localhost/deals");
      const response = (await handleGetDeals(
        url,
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.status).toBe(404);
    });
  });

  describe("handleSimilarDeals", () => {
    it("should return similar deals by category", async () => {
      const url = new URL("http://localhost/deals/similar?code=DEAL1");
      const response = (await handleSimilarDeals(
        url,
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.status).toBe(200);
      const body = jsonRecord(response.data);
      expect(jsonRecord(body.reference).code).toBe("DEAL1");
      // Other active deal is DEAL2, but DEAL1 is finance and DEAL2 is shopping.
      // However, it might still return it if there's any similarity or just as fallback
      // In this case, categories are different, domains are different.
    });

    it("should return 400 if no code or domain provided", async () => {
      const url = new URL("http://localhost/deals/similar");
      const response = (await handleSimilarDeals(
        url,
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.status).toBe(400);
    });
  });

  describe("handleRankedDeals", () => {
    it("should return ranked deals", async () => {
      const url = new URL("http://localhost/deals/ranked");
      const response = (await handleRankedDeals(
        url,
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.status).toBe(200);
      const body = jsonRecord(response.data);
      expect(body.deals).toBeDefined();
    });
  });

  describe("handleDealHighlights", () => {
    it("should return highlights", async () => {
      const url = new URL("http://localhost/deals/highlights");
      const response = (await handleDealHighlights(
        url,
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.status).toBe(200);
      const body = jsonRecord(response.data);
      expect(body.top_deals).toBeDefined();
      expect(body.expiring_soon).toBeDefined();
      expect(body.recently_added).toBeDefined();
    });
  });

  describe("handleExplainDeal", () => {
    it("should explain a deal", async () => {
      const response = (await handleExplainDeal(
        "1",
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.status).toBe(200);
      const body = jsonRecord(response.data);
      expect(body.summary).toBeDefined();
    });

    it("should return 404 if deal not found", async () => {
      const response = (await handleExplainDeal(
        "nonexistent",
        mockEnv,
      )) as unknown as MockJsonResponse;

      expect(response.status).toBe(404);
    });
  });
});
