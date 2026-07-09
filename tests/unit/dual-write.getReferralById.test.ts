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

  describe("getReferralById", () => {
    it("should read from D1 when USE_D1_READS is true and D1 returns data", async () => {
      const d1Row = {
        id: "ref-001",
        code: "TESTCODE",
        url: "https://example.com/invite",
        domain: "example.com",
        source: "https://example.com/invite",
        status: "active",
        title: "Test Referral",
        description: "Test description",
        reward_type: "cash",
        reward_value: "50",
        category: '["referral"]',
        tags: '["test"]',
        submitted_at: "2024-01-01T00:00:00Z",
        submitted_by: "user1",
        expires_at: null,
        deactivated_at: null,
        deactivated_reason: null,
        metadata: null,
      };
      mockD1Client.queryFirst.mockResolvedValue({ success: true, data: d1Row });

      const result = await getReferralById(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "ref-001",
      );

      expect(mockD1Client.queryFirst).toHaveBeenCalledTimes(1);
      expect(mockGetFromKVById).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.id).toBe("ref-001");
      expect(result!.code).toBe("TESTCODE");
    });

    it("should fall back to KV when D1 read returns no data", async () => {
      mockD1Client.queryFirst.mockResolvedValue({ success: true, data: null });
      const kvResult = createMockReferral({ id: "ref-001" });
      mockGetFromKVById.mockResolvedValue(kvResult);

      const result = await getReferralById(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "ref-001",
      );

      expect(mockD1Client.queryFirst).toHaveBeenCalledTimes(1);
      expect(mockGetFromKVById).toHaveBeenCalledTimes(1);
      expect(result).toEqual(kvResult);
    });

    it("should fall back to KV when D1 read throws an error", async () => {
      mockD1Client.queryFirst.mockRejectedValue(
        new Error("D1 connection error"),
      );
      const kvResult = createMockReferral({ id: "ref-001" });
      mockGetFromKVById.mockResolvedValue(kvResult);

      const result = await getReferralById(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "ref-001",
      );

      expect(mockD1Client.queryFirst).toHaveBeenCalledTimes(1);
      expect(mockGetFromKVById).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalled();
      expect(result).toEqual(kvResult);
    });

    it("should read from KV when USE_D1_READS is false", async () => {
      const kvResult = createMockReferral({ id: "ref-001" });
      mockGetFromKVById.mockResolvedValue(kvResult);

      const result = await getReferralById(
        createMockEnv({
          USE_D1_READS: "false",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "ref-001",
      );

      expect(mockD1Client.queryFirst).not.toHaveBeenCalled();
      expect(mockGetFromKVById).toHaveBeenCalledTimes(1);
      expect(result).toEqual(kvResult);
    });

    it("should read from KV when USE_D1_READS is true but DEALS_DB is undefined", async () => {
      const kvResult = createMockReferral({ id: "ref-001" });
      mockGetFromKVById.mockResolvedValue(kvResult);

      const result = await getReferralById(
        createMockEnv({ USE_D1_READS: "true", DEALS_DB: undefined }),
        "ref-001",
      );

      expect(mockD1Client.queryFirst).not.toHaveBeenCalled();
      expect(mockGetFromKVById).toHaveBeenCalledTimes(1);
      expect(result).toEqual(kvResult);
    });

    it("should return null when both D1 and KV return nothing", async () => {
      mockD1Client.queryFirst.mockResolvedValue({ success: true, data: null });
      mockGetFromKVById.mockResolvedValue(null);

      const result = await getReferralById(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "nonexistent",
      );

      expect(result).toBeNull();
    });

    it("should parse category and tags from JSON strings in D1 result", async () => {
      const d1Row = {
        id: "ref-005",
        code: "CATCODE",
        url: "https://example.com/invite",
        domain: "example.com",
        source: "https://example.com/invite",
        status: "active",
        title: "Categorized Referral",
        description: "With categories",
        reward_type: "credit",
        reward_value: "100",
        category: '["finance","banking"]',
        tags: '["new","exclusive"]',
        submitted_at: "2024-01-01T00:00:00Z",
        submitted_by: "user1",
        expires_at: null,
        deactivated_at: null,
        deactivated_reason: null,
        metadata: null,
      };
      mockD1Client.queryFirst.mockResolvedValue({ success: true, data: d1Row });

      const result = await getReferralById(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "ref-005",
      );

      expect(result!.metadata!.category).toEqual(["finance", "banking"]);
      expect(result!.metadata!.tags).toEqual(["new", "exclusive"]);
    });

    it("should use default category and tags when D1 fields are null", async () => {
      const d1Row = {
        id: "ref-006",
        code: "NULLCAT",
        url: "https://example.com/invite",
        domain: "example.com",
        source: "https://example.com/invite",
        status: "active",
        title: "No Category",
        description: "",
        reward_type: "cash",
        reward_value: "25",
        category: null,
        tags: null,
        submitted_at: "2024-01-01T00:00:00Z",
        submitted_by: "user1",
        expires_at: null,
        deactivated_at: null,
        deactivated_reason: null,
        metadata: null,
      };
      mockD1Client.queryFirst.mockResolvedValue({ success: true, data: d1Row });

      const result = await getReferralById(
        createMockEnv({
          USE_D1_READS: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "ref-006",
      );

      expect(result!.metadata!.category).toEqual(["referral"]);
      expect(result!.metadata!.tags).toEqual([]);
    });
  });

