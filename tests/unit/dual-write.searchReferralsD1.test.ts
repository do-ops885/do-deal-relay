import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, ReferralInput } from "../../../worker/types";

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}));

const {
  mockStoreInKV,
  mockGetFromKVById,
  mockGetFromKVByCode,
  mockUpdateInKV,
  mockDeactivateInKV,
  mockReactivateInKV,
} = vi.hoisted(() => ({
  mockStoreInKV: vi.fn(),
  mockGetFromKVById: vi.fn(),
  mockGetFromKVByCode: vi.fn(),
  mockUpdateInKV: vi.fn(),
  mockDeactivateInKV: vi.fn(),
  mockReactivateInKV: vi.fn(),
}));

const {
  mockInsertDeal,
  mockInsertReferralCode,
  mockGetReferralCodeByString,
  mockGetReferralCodesByDeal,
} = vi.hoisted(() => ({
  mockInsertDeal: vi.fn(),
  mockInsertReferralCode: vi.fn(),
  mockGetReferralCodeByString: vi.fn(),
  mockGetReferralCodesByDeal: vi.fn(),
}));

const { mockCreateD1Client, getMockD1Client, setMockD1Client } = vi.hoisted(
  () => {
    let currentMockClient: ReturnType<typeof createFreshMockD1Client> | null =
      null;

    function createFreshMockD1Client() {
      return {
        execute: vi.fn().mockResolvedValue({ success: true, lastRowId: 1 }),
        query: vi.fn().mockResolvedValue({ success: true, data: [] }),
        queryFirst: vi.fn().mockResolvedValue({ success: true, data: null }),
        queryWithJson: vi.fn().mockResolvedValue({ success: true, data: [] }),
        raw: vi.fn().mockResolvedValue({ success: true }),
        batch: vi.fn().mockResolvedValue({ success: true, results: [] }),
        batchInsert: vi.fn().mockResolvedValue({ success: true }),
        insertWithJson: vi.fn().mockResolvedValue({ success: true }),
        prepare: vi.fn(),
        runPrepared: vi.fn(),
        transaction: vi.fn(),
        getBookmark: vi.fn(),
      };
    }

    return {
      mockCreateD1Client: vi.fn(() => {
        if (!currentMockClient) {
          currentMockClient = createFreshMockD1Client();
        }
        return currentMockClient;
      }),
      getMockD1Client: () => currentMockClient || createFreshMockD1Client(),
      setMockD1Client: (client: ReturnType<typeof createFreshMockD1Client>) => {
        currentMockClient = client;
      },
    };
  },
);

vi.mock("../../../worker/lib/logger", () => ({
  createStructuredLogger: vi.fn(() => ({
    error: mockLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock("../../../worker/lib/referral-storage/crud", () => ({
  storeReferralInput: mockStoreInKV,
  getReferralById: mockGetFromKVById,
  getReferralByCode: mockGetFromKVByCode,
  updateReferralStatus: mockUpdateInKV,
  deactivateReferral: mockDeactivateInKV,
  reactivateReferral: mockReactivateInKV,
}));

vi.mock("../../../worker/lib/d1/queries", () => ({
  insertDeal: mockInsertDeal,
  insertReferralCode: mockInsertReferralCode,
  getReferralCodeByString: mockGetReferralCodeByString,
  getReferralCodesByDeal: mockGetReferralCodesByDeal,
}));

vi.mock("../../../worker/lib/d1/client", () => ({
  createD1Client: mockCreateD1Client,
  createD1ReadClient: mockCreateD1Client,
}));

import {
  storeReferralDual,
  getReferralById,
  getReferralByCode,
  updateReferralStatus,
  deactivateReferral,
  reactivateReferral,
  searchReferralsD1,
  getExpiringReferralsD1,
  getReferralStatsD1,
} from "../../../worker/lib/referral-storage/dual-write";

const createMockReferral = (
  overrides: Partial<ReferralInput> = {},
): ReferralInput => ({
  url: "https://example.com/invite",
  code: "TESTCODE",
  domain: "example.com",
  description: "Test referral description",
  status: "active",
  submitted_at: new Date().toISOString(),
  submitted_by: "test-user",
  metadata: {
    title: "Test Referral",
    reward_type: "cash",
    reward_value: 50,
    category: ["referral"],
    tags: ["test"],
    confidence_score: 0.8,
  },
  ...overrides,
});

const createMockEnv = (overrides: Partial<Env> = {}): Env => ({
  DEALS_SOURCES: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as Env["DEALS_SOURCES"],
  DEALS_DB: {} as unknown as Env["DEALS_DB"],
  DEALS_PROD: {} as unknown as Env["DEALS_PROD"],
  DEALS_STAGING: {} as unknown as Env["DEALS_STAGING"],
  DEALS_LOG: {} as unknown as Env["DEALS_LOG"],
  DEALS_LOCK: {} as unknown as Env["DEALS_LOCK"],
  AI_GATEWAY_URL: "https://gateway.test",
  ENVIRONMENT: "test",
  GITHUB_REPO: "test/repo",
  TRUST_THRESHOLD: "0.5",
  NOTIFICATION_THRESHOLD: "100",
  USE_D1_READS: "false",
  DISABLE_DUAL_WRITE: "false",
  WEBHOOK_SECRET: "test-secret",
  API_ENCRYPTION_KEY: "test-encryption-key",
  ...overrides,
});

  describe("searchReferralsD1", () => {
    it("should search D1 with query and return results", async () => {
      const d1Rows = [
        {
          id: "ref-001",
          code: "CODE1",
          url: "https://example.com/1",
          domain: "example.com",
          source: "https://example.com/1",
          status: "active",
          title: "First Deal",
          description: "First description",
          reward_type: "cash",
          reward_value: 50,
          category: ["referral"],
          tags: ["test"],
          submitted_at: "2024-01-01T00:00:00Z",
          expires_at: null,
        },
      ];
      mockD1Client.queryWithJson.mockResolvedValue({
        success: true,
        data: d1Rows,
      });

      const results = await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test query",
      );

      expect(mockD1Client.queryWithJson).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0]!.code).toBe("CODE1");
      expect(results[0]!.metadata!.title).toBe("First Deal");
    });

    it("should apply domain filter when provided", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
        { domain: "example.com" },
      );

      const sql = mockD1Client.queryWithJson.mock.calls[0]![0];
      expect(sql).toContain("d.domain = ?");
    });

    it("should apply status filter when provided", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
        { status: "inactive" },
      );

      const sql = mockD1Client.queryWithJson.mock.calls[0]![0];
      expect(sql).toContain("rc.status = ?");
    });

    it("should include is_active filter when no status is provided", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
      );

      const sql = mockD1Client.queryWithJson.mock.calls[0]![0];
      expect(sql).toContain("is_active = 1");
      expect(sql).not.toContain("rc.status = ?");
    });

    it("should respect limit option", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
        { limit: 5 },
      );

      const params = mockD1Client.queryWithJson.mock.calls[0]![1];
      const lastParam = params[params.length - 1];
      expect(lastParam).toBe(5);
    });

    it("should use default limit of 20 when not specified", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
      );

      const params = mockD1Client.queryWithJson.mock.calls[0]![1];
      const lastParam = params[params.length - 1];
      expect(lastParam).toBe(20);
    });

    it("should return empty array when DEALS_DB is undefined", async () => {
      const results = await searchReferralsD1(
        createMockEnv({ DEALS_DB: undefined }),
        "test",
      );

      expect(mockD1Client.queryWithJson).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it("should return empty array when D1 returns no data", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({
        success: true,
        data: undefined,
      });

      const results = await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "nothing",
      );

      expect(results).toEqual([]);
    });

    it("should return empty array on D1 error", async () => {
      mockD1Client.queryWithJson.mockRejectedValue(new Error("Search failed"));

      const results = await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
      );

      expect(results).toEqual([]);
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it("should pass category and tags as jsonFields to queryWithJson", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
      );

      const jsonFields = mockD1Client.queryWithJson.mock.calls[0]![2];
      expect(jsonFields).toEqual(["category", "tags"]);
    });

    it("should combine domain and status filters", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
        { domain: "example.com", status: "active", limit: 10 },
      );

      const sql = mockD1Client.queryWithJson.mock.calls[0]![0];
      expect(sql).toContain("d.domain = ?");
      expect(sql).toContain("rc.status = ?");
      const params = mockD1Client.queryWithJson.mock.calls[0]![1];
      expect(params).toContain("example.com");
      expect(params).toContain("active");
      expect(params).toContain(10);
    });
  });

