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

  describe("storeReferralDual", () => {
    it("should store referral to KV and D1 when dual-write is enabled", async () => {
      const referral = createMockReferral({ id: "ref-001" });
      mockStoreInKV.mockResolvedValue(referral);
      mockInsertDeal.mockResolvedValue({ success: true, id: 42 });
      mockInsertReferralCode.mockResolvedValue({ success: true, id: 1 });

      const result = await storeReferralDual(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        referral,
      );

      expect(mockStoreInKV).toHaveBeenCalledTimes(1);
      expect(mockStoreInKV).toHaveBeenCalledWith(expect.any(Object), referral);
      expect(mockInsertDeal).toHaveBeenCalledTimes(1);
      expect(mockInsertReferralCode).toHaveBeenCalledTimes(1);
      expect(result).toEqual(referral);
    });

    it("should store to KV only when D1 is unavailable", async () => {
      const referral = createMockReferral();
      mockStoreInKV.mockResolvedValue(referral);

      const result = await storeReferralDual(
        createMockEnv({ DEALS_DB: undefined }),
        referral,
      );

      expect(mockStoreInKV).toHaveBeenCalledTimes(1);
      expect(mockInsertDeal).not.toHaveBeenCalled();
      expect(mockInsertReferralCode).not.toHaveBeenCalled();
      expect(result).toEqual(referral);
    });

    it("should still write to D1 when DEALS_DB is defined regardless of DISABLE_DUAL_WRITE", async () => {
      const referral = createMockReferral();
      mockStoreInKV.mockResolvedValue(referral);
      mockInsertDeal.mockResolvedValue({ success: true, id: 42 });

      const result = await storeReferralDual(
        createMockEnv({
          DISABLE_DUAL_WRITE: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        referral,
      );

      expect(mockStoreInKV).toHaveBeenCalledTimes(1);
      expect(mockInsertDeal).toHaveBeenCalledTimes(1);
      expect(result).toEqual(referral);
    });

    it("should not fail when D1 insertion throws an error", async () => {
      const referral = createMockReferral({ id: "ref-002" });
      mockStoreInKV.mockResolvedValue(referral);
      mockInsertDeal.mockRejectedValue(new Error("D1 write failed"));

      const result = await storeReferralDual(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        referral,
      );

      expect(mockStoreInKV).toHaveBeenCalledTimes(1);
      expect(mockInsertDeal).toHaveBeenCalledTimes(1);
      expect(mockInsertReferralCode).not.toHaveBeenCalled();
      expect(mockLoggerError).toHaveBeenCalled();
      expect(result).toEqual(referral);
    });

    it("should not fail when insertDeal succeeds but insertReferralCode fails", async () => {
      const referral = createMockReferral({ id: "ref-003" });
      mockStoreInKV.mockResolvedValue(referral);
      mockInsertDeal.mockResolvedValue({ success: true, id: 42 });
      mockInsertReferralCode.mockRejectedValue(
        new Error("Referral code insert failed"),
      );

      const result = await storeReferralDual(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        referral,
      );

      expect(mockStoreInKV).toHaveBeenCalledTimes(1);
      expect(mockInsertDeal).toHaveBeenCalledTimes(1);
      expect(mockInsertReferralCode).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalled();
      expect(result).toEqual(referral);
    });

    it("should not try insertReferralCode when insertDeal returns no id", async () => {
      const referral = createMockReferral({ id: "ref-004" });
      mockStoreInKV.mockResolvedValue(referral);
      mockInsertDeal.mockResolvedValue({ success: true, id: undefined });

      const result = await storeReferralDual(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        referral,
      );

      expect(mockStoreInKV).toHaveBeenCalledTimes(1);
      expect(mockInsertDeal).toHaveBeenCalledTimes(1);
      expect(mockInsertReferralCode).not.toHaveBeenCalled();
      expect(result).toEqual(referral);
    });

    it("should generate id from code when referral id is missing", async () => {
      const referral = createMockReferral({ id: undefined });
      mockStoreInKV.mockResolvedValue(referral);
      mockInsertDeal.mockResolvedValue({ success: true, id: 42 });

      await storeReferralDual(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        referral,
      );

      const dealArg = mockInsertDeal.mock.calls[0]![1];
      expect(dealArg.deal_id).toBe("ref_TESTCODE");
    });

    it("should construct domain from URL when domain is not provided", async () => {
      const referral = createMockReferral({ domain: undefined });
      mockStoreInKV.mockResolvedValue(referral);
      mockInsertDeal.mockResolvedValue({ success: true, id: 42 });

      await storeReferralDual(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        referral,
      );

      const dealArg = mockInsertDeal.mock.calls[0]![1];
      expect(dealArg.domain).toBe("example.com");
    });
  });

