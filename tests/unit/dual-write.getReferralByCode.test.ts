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

  describe("getReferralByCode", () => {
    it("should read from D1 when USE_D1_READS is true and D1 returns data", async () => {
      const d1Result = {
        id: 1,
        code: "TESTCODE",
        deal_id: 42,
        deal_title: "Test Deal",
        domain: "example.com",
        status: "active",
        max_uses: null,
        current_uses: 0,
        use_count: 0,
        expires_at: null,
      };
      mockGetReferralCodeByString.mockResolvedValue(d1Result);

      const result = await getReferralByCode(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "TESTCODE",
      );

      expect(mockGetReferralCodeByString).toHaveBeenCalledWith(
        expect.any(Object),
        "TESTCODE",
      );
      expect(mockGetFromKVByCode).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.code).toBe("TESTCODE");
      expect(result!.domain).toBe("example.com");
    });

    it("should fall back to KV when D1 returns null", async () => {
      mockGetReferralCodeByString.mockResolvedValue(null);
      const kvResult = createMockReferral({ id: "ref-001", code: "TESTCODE" });
      mockGetFromKVByCode.mockResolvedValue(kvResult);

      const result = await getReferralByCode(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "TESTCODE",
      );

      expect(mockGetReferralCodeByString).toHaveBeenCalledTimes(1);
      expect(mockGetFromKVByCode).toHaveBeenCalledTimes(1);
      expect(result).toEqual(kvResult);
    });

    it("should fall back to KV when D1 read throws an error", async () => {
      mockGetReferralCodeByString.mockRejectedValue(new Error("D1 error"));
      const kvResult = createMockReferral({ code: "TESTCODE" });
      mockGetFromKVByCode.mockResolvedValue(kvResult);

      const result = await getReferralByCode(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "TESTCODE",
      );

      expect(mockGetFromKVByCode).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalled();
      expect(result).toEqual(kvResult);
    });

    it("should read from KV when USE_D1_READS is false", async () => {
      const kvResult = createMockReferral({ code: "TESTCODE" });
      mockGetFromKVByCode.mockResolvedValue(kvResult);

      const result = await getReferralByCode(
        createMockEnv({
          USE_D1_READS: "false",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "TESTCODE",
      );

      expect(mockGetReferralCodeByString).not.toHaveBeenCalled();
      expect(mockGetFromKVByCode).toHaveBeenCalledTimes(1);
      expect(result).toEqual(kvResult);
    });

    it("should read from KV when USE_D1_READS is true but DEALS_DB is undefined", async () => {
      const kvResult = createMockReferral({ code: "TESTCODE" });
      mockGetFromKVByCode.mockResolvedValue(kvResult);

      const result = await getReferralByCode(
        createMockEnv({ USE_D1_READS: "true", DEALS_DB: undefined }),
        "TESTCODE",
      );

      expect(mockGetReferralCodeByString).not.toHaveBeenCalled();
      expect(mockGetFromKVByCode).toHaveBeenCalledTimes(1);
      expect(result).toEqual(kvResult);
    });

    it("should return null when both D1 and KV return nothing", async () => {
      mockGetReferralCodeByString.mockResolvedValue(null);
      mockGetFromKVByCode.mockResolvedValue(null);

      const result = await getReferralByCode(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "NONEXISTENT",
      );

      expect(result).toBeNull();
    });

    it("should pass deal_title as metadata title from D1 result", async () => {
      mockGetReferralCodeByString.mockResolvedValue({
        id: 1,
        code: "DEALCODE",
        deal_id: 42,
        deal_title: "Special Deal Title",
        domain: "example.com",
        status: "active",
        max_uses: null,
        current_uses: 0,
        use_count: 0,
        expires_at: null,
      });

      const result = await getReferralByCode(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "DEALCODE",
      );

      expect(result!.metadata!.title).toBe("Special Deal Title");
    });
  });

