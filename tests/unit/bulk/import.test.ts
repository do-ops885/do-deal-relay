/**
 * Bulk Import Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../../worker/types";

// Type for KV namespace mock
type MockKVNamespace = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

// Mock dependencies
vi.mock("../../../worker/lib/error-handler", () => ({
  handleError: vi.fn((error) => error),
}));

vi.mock("../../../worker/lib/referral-storage", () => ({
  storeReferralInput: vi.fn().mockResolvedValue(undefined),
  getReferralByCode: vi.fn().mockResolvedValue(null),
  searchReferrals: vi.fn().mockResolvedValue({ referrals: [], total: 0 }),
}));

vi.mock("../../../worker/lib/crypto", () => ({
  generateDealId: vi.fn().mockResolvedValue("test-id-hash"),
}));

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../../worker/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, resetTime: 0 }),
  getClientIdentifier: vi.fn().mockReturnValue("test-client-id"),
}));

vi.mock("../../../worker/lib/storage", () => ({
  getProductionSnapshot: vi.fn().mockResolvedValue(null),
}));

describe("Bulk Import", () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      DEALS_PROD: {} as MockKVNamespace,
      DEALS_STAGING: {} as MockKVNamespace,
      DEALS_LOG: {} as MockKVNamespace,
      DEALS_LOCK: {} as MockKVNamespace,
      DEALS_SOURCES: {} as MockKVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "0",
    } as unknown as Env;

    vi.clearAllMocks();
  });

  describe("handleBulkImport", () => {
    it("should import a single valid deal", async () => {
      const { handleBulkImport } = await import("../../../worker/routes/bulk");
      const { getReferralByCode } =
        await import("../../../worker/lib/referral-storage");

      vi.mocked(getReferralByCode).mockResolvedValue(null);

      const request = new Request("http://localhost/api/bulk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deals: [
            {
              code: "TEST123",
              url: "https://example.com/invite/TEST123",
              domain: "example.com",
            },
          ],
        }),
      });

      const response = await handleBulkImport(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.total).toBe(1);
      expect(data.imported).toBe(1);
      expect(data.failed).toBe(0);
      expect(data.results).toHaveLength(1);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].code).toBe("TEST123");
    });

    it("should handle empty deals array", async () => {
      const { handleBulkImport } = await import("../../../worker/routes/bulk");

      const request = new Request("http://localhost/api/bulk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deals: [] }),
      });

      const response = await handleBulkImport(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("cannot be empty");
    });

    it("should reject deals exceeding batch limit", async () => {
      const { handleBulkImport } = await import("../../../worker/routes/bulk");

      const deals = Array.from({ length: 101 }, (_, i) => ({
        code: `CODE${i}`,
        url: `https://example${i}.com/invite/CODE${i}`,
        domain: `example${i}.com`,
      }));

      const request = new Request("http://localhost/api/bulk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deals }),
      });

      const response = await handleBulkImport(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Maximum 100 deals");
    });

    it("should report validation errors for invalid deals", async () => {
      const { handleBulkImport } = await import("../../../worker/routes/bulk");

      const request = new Request("http://localhost/api/bulk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deals: [
            {
              code: "", // Invalid: empty code
              url: "not-a-url", // Invalid: not a valid URL
              domain: "", // Invalid: empty domain
            },
          ],
        }),
      });

      const response = await handleBulkImport(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(207); // 207 Multi-Status when some items fail
      expect(data.imported).toBe(0);
      expect(data.failed).toBe(1);
      expect(data.results[0].success).toBe(false);
      expect(data.results[0].errors).toBeDefined();
      expect(data.results[0].errors.length).toBeGreaterThan(0);
    });

    it("should detect duplicate codes", async () => {
      const { handleBulkImport } = await import("../../../worker/routes/bulk");
      const { getReferralByCode } =
        await import("../../../worker/lib/referral-storage");

      // Mock existing referral
      vi.mocked(getReferralByCode).mockResolvedValue({
        id: "existing-id",
        code: "EXISTING",
        url: "https://example.com/invite/EXISTING",
        domain: "example.com",
        status: "active",
      });

      const request = new Request("http://localhost/api/bulk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deals: [
            {
              code: "EXISTING",
              url: "https://example.com/invite/EXISTING",
              domain: "example.com",
            },
          ],
        }),
      });

      const response = await handleBulkImport(request, mockEnv);
      const data = await response.json();

      expect(data.imported).toBe(0);
      expect(data.skipped).toBe(1);
      expect(data.results[0].message).toBe("already exists");
      expect(data.results[0].referral_id).toBe("existing-id");
    });

    it("should import multiple deals in batch", async () => {
      const { handleBulkImport } = await import("../../../worker/routes/bulk");
      const { getReferralByCode } =
        await import("../../../worker/lib/referral-storage");

      vi.mocked(getReferralByCode).mockResolvedValue(null);

      const deals = [
        { code: "CODE1", url: "https://ex1.com/ref/CODE1", domain: "ex1.com" },
        { code: "CODE2", url: "https://ex2.com/ref/CODE2", domain: "ex2.com" },
        { code: "CODE3", url: "https://ex3.com/ref/CODE3", domain: "ex3.com" },
      ];

      const request = new Request("http://localhost/api/bulk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deals }),
      });

      const response = await handleBulkImport(request, mockEnv);
      const data = await response.json();

      expect(data.total).toBe(3);
      expect(data.imported).toBe(3);
      expect(data.failed).toBe(0);
      expect(data.results).toHaveLength(3);
    });

    it("should require Content-Type header", async () => {
      const { handleBulkImport } = await import("../../../worker/routes/bulk");

      const request = new Request("http://localhost/api/bulk/import", {
        method: "POST",
        body: JSON.stringify({ deals: [] }),
      });

      const response = await handleBulkImport(request, mockEnv);

      expect(response.status).toBe(415);
    });

    it("should handle metadata fields", async () => {
      const { handleBulkImport } = await import("../../../worker/routes/bulk");
      const { getReferralByCode, storeReferralInput } =
        await import("../../../worker/lib/referral-storage");

      vi.mocked(getReferralByCode).mockResolvedValue(null);

      const request = new Request("http://localhost/api/bulk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deals: [
            {
              code: "META1",
              url: "https://meta.com/ref/META1",
              domain: "meta.com",
              source: "test",
              submitted_by: "tester",
              metadata: {
                title: "Meta Referral",
                description: "Test referral",
                reward_type: "cash",
                reward_value: 50,
                category: ["shopping"],
                tags: ["promo"],
                confidence_score: 0.9,
              },
            },
          ],
        }),
      });

      const response = await handleBulkImport(request, mockEnv);
      const data = await response.json();

      expect(data.imported).toBe(1);
      expect(data.results[0].success).toBe(true);

      // Verify metadata was passed to storage
      const storedReferral = vi.mocked(storeReferralInput).mock.calls[0][1];
      expect(storedReferral.metadata?.title).toBe("Meta Referral");
      expect(storedReferral.metadata?.reward_value).toBe(50);
      expect(storedReferral.metadata?.confidence_score).toBe(0.9);
    });
  });
});
