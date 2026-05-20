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
  ...overrides,
});

describe("Dual-Write Referral Storage", () => {
  let mockD1Client: ReturnType<typeof getMockD1Client>;

  beforeEach(() => {
    vi.clearAllMocks();
    const fresh = {
      execute: vi
        .fn()
        .mockResolvedValue({ success: true, lastRowId: 1, changes: 1 }),
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
    setMockD1Client(fresh);
    mockD1Client = fresh;
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

      const dealArg = mockInsertDeal.mock.calls[0][1];
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

      const dealArg = mockInsertDeal.mock.calls[0][1];
      expect(dealArg.domain).toBe("example.com");
    });
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

  describe("updateReferralStatus", () => {
    it("should update status in both KV and D1", async () => {
      const kvResult = createMockReferral({
        id: "ref-001",
        code: "TESTCODE",
        status: "active",
      });
      mockUpdateInKV.mockResolvedValue(kvResult);

      const result = await updateReferralStatus(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "ref-001",
        "inactive",
        "expired",
        "No longer valid",
      );

      expect(mockUpdateInKV).toHaveBeenCalledWith(
        expect.any(Object),
        "ref-001",
        "inactive",
        "expired",
        "No longer valid",
      );
      expect(mockD1Client.execute).toHaveBeenCalledTimes(1);
      const executeCall = mockD1Client.execute.mock.calls[0];
      expect(executeCall[0]).toContain("UPDATE referral_codes");
      expect(executeCall[1]).toContain("inactive");
      expect(executeCall[1]).toContain("TESTCODE");
      expect(result).toEqual(kvResult);
    });

    it("should update in KV only when D1 is unavailable", async () => {
      const kvResult = createMockReferral({
        id: "ref-001",
        status: "inactive",
      });
      mockUpdateInKV.mockResolvedValue(kvResult);

      const result = await updateReferralStatus(
        createMockEnv({ DEALS_DB: undefined }),
        "ref-001",
        "inactive",
      );

      expect(mockUpdateInKV).toHaveBeenCalledTimes(1);
      expect(mockD1Client.execute).not.toHaveBeenCalled();
      expect(result).toEqual(kvResult);
    });

    it("should not update D1 when KV returns null", async () => {
      mockUpdateInKV.mockResolvedValue(null);

      const result = await updateReferralStatus(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "nonexistent",
        "inactive",
      );

      expect(mockD1Client.execute).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should not fail when D1 update throws an error", async () => {
      const kvResult = createMockReferral({ id: "ref-001", code: "TESTCODE" });
      mockUpdateInKV.mockResolvedValue(kvResult);
      mockD1Client.execute.mockRejectedValue(new Error("D1 update failed"));

      const result = await updateReferralStatus(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "ref-001",
        "inactive",
      );

      expect(mockUpdateInKV).toHaveBeenCalledTimes(1);
      expect(mockD1Client.execute).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalled();
      expect(result).toEqual(kvResult);
    });

    it("should pass is_active=0 when status is not active", async () => {
      const kvResult = createMockReferral({
        id: "ref-002",
        code: "CODE2",
        status: "active",
      });
      mockUpdateInKV.mockResolvedValue(kvResult);

      await updateReferralStatus(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "ref-002",
        "expired",
        "timeout",
      );

      const params = mockD1Client.execute.mock.calls[0][1];
      expect(params[1]).toBe(0);
      expect(params[2]).not.toBeNull();
    });

    it("should pass is_active=1 when status is active", async () => {
      const kvResult = createMockReferral({
        id: "ref-003",
        code: "CODE3",
        status: "inactive",
      });
      mockUpdateInKV.mockResolvedValue(kvResult);

      await updateReferralStatus(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "ref-003",
        "active",
      );

      const params = mockD1Client.execute.mock.calls[0][1];
      expect(params[1]).toBe(1);
      expect(params[2]).toBeNull();
    });

    it("should still update D1 when DEALS_DB is defined regardless of DISABLE_DUAL_WRITE", async () => {
      const kvResult = createMockReferral({ id: "ref-001", code: "TESTCODE" });
      mockUpdateInKV.mockResolvedValue(kvResult);

      const result = await updateReferralStatus(
        createMockEnv({
          DISABLE_DUAL_WRITE: "true",
          DEALS_DB: {} as unknown as Env["DEALS_DB"],
        }),
        "ref-001",
        "inactive",
      );

      expect(mockD1Client.execute).toHaveBeenCalledTimes(1);
      expect(result).toEqual(kvResult);
    });
  });

  describe("deactivateReferral", () => {
    it("should deactivate in both KV and D1", async () => {
      const kvResult = createMockReferral({
        id: "ref-001",
        code: "TESTCODE",
        status: "inactive",
      });
      mockDeactivateInKV.mockResolvedValue(kvResult);

      const result = await deactivateReferral(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "TESTCODE",
        "no_longer_valid",
        "NEWCODE",
        "Replaced by better offer",
      );

      expect(mockDeactivateInKV).toHaveBeenCalledWith(
        expect.any(Object),
        "TESTCODE",
        "no_longer_valid",
        "NEWCODE",
        "Replaced by better offer",
      );
      expect(mockD1Client.execute).toHaveBeenCalledTimes(1);
      const executeCall = mockD1Client.execute.mock.calls[0];
      expect(executeCall[0]).toContain("UPDATE referral_codes");
      expect(executeCall[0]).toContain("SET status = 'inactive'");
      expect(executeCall[1]).toEqual(["no_longer_valid", "TESTCODE"]);
      expect(result).toEqual(kvResult);
    });

    it("should deactivate in KV only when D1 is unavailable", async () => {
      const kvResult = createMockReferral({ status: "inactive" });
      mockDeactivateInKV.mockResolvedValue(kvResult);

      const result = await deactivateReferral(
        createMockEnv({ DEALS_DB: undefined }),
        "TESTCODE",
        "manual",
      );

      expect(mockD1Client.execute).not.toHaveBeenCalled();
      expect(result).toEqual(kvResult);
    });

    it("should not deactivate in D1 when KV returns null", async () => {
      mockDeactivateInKV.mockResolvedValue(null);

      const result = await deactivateReferral(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "NONEXISTENT",
        "manual",
      );

      expect(mockD1Client.execute).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should not fail when D1 deactivate throws an error", async () => {
      const kvResult = createMockReferral({
        id: "ref-001",
        code: "TESTCODE",
        status: "inactive",
      });
      mockDeactivateInKV.mockResolvedValue(kvResult);
      mockD1Client.execute.mockRejectedValue(new Error("D1 update failed"));

      const result = await deactivateReferral(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "TESTCODE",
        "manual",
      );

      expect(mockD1Client.execute).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalled();
      expect(result).toEqual(kvResult);
    });

    it("should use 'manual' as default reason when reason is not provided", async () => {
      const kvResult = createMockReferral({
        id: "ref-001",
        code: "CODE1",
        status: "inactive",
      });
      mockDeactivateInKV.mockResolvedValue(kvResult);

      await deactivateReferral(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "CODE1",
        undefined as unknown as string,
      );

      const params = mockD1Client.execute.mock.calls[0][1];
      expect(params[0]).toBe("manual");
    });
  });

  describe("reactivateReferral", () => {
    it("should reactivate in both KV and D1", async () => {
      const kvResult = createMockReferral({
        id: "ref-001",
        code: "TESTCODE",
        status: "active",
      });
      mockReactivateInKV.mockResolvedValue(kvResult);

      const result = await reactivateReferral(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "TESTCODE",
        "Reactivated after review",
      );

      expect(mockReactivateInKV).toHaveBeenCalledWith(
        expect.any(Object),
        "TESTCODE",
        "Reactivated after review",
        undefined,
      );
      expect(mockD1Client.execute).toHaveBeenCalledTimes(1);
      const executeCall = mockD1Client.execute.mock.calls[0];
      expect(executeCall[0]).toContain("UPDATE referral_codes");
      expect(executeCall[0]).toContain("SET status = 'active'");
      expect(executeCall[0]).toContain("is_active = 1");
      expect(executeCall[0]).toContain("deactivated_at = NULL");
      expect(executeCall[1]).toEqual(["TESTCODE"]);
      expect(result).toEqual(kvResult);
    });

    it("should reactivate in KV only when D1 is unavailable", async () => {
      const kvResult = createMockReferral({ status: "active" });
      mockReactivateInKV.mockResolvedValue(kvResult);

      const result = await reactivateReferral(
        createMockEnv({ DEALS_DB: undefined }),
        "TESTCODE",
      );

      expect(mockD1Client.execute).not.toHaveBeenCalled();
      expect(result).toEqual(kvResult);
    });

    it("should not reactivate in D1 when KV returns null", async () => {
      mockReactivateInKV.mockResolvedValue(null);

      const result = await reactivateReferral(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "NONEXISTENT",
      );

      expect(mockD1Client.execute).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should not fail when D1 reactivate throws an error", async () => {
      const kvResult = createMockReferral({
        id: "ref-001",
        code: "TESTCODE",
        status: "active",
      });
      mockReactivateInKV.mockResolvedValue(kvResult);
      mockD1Client.execute.mockRejectedValue(new Error("D1 update failed"));

      const result = await reactivateReferral(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "TESTCODE",
      );

      expect(mockD1Client.execute).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalled();
      expect(result).toEqual(kvResult);
    });

    it("should pass existingReferral to KV function when provided", async () => {
      const existing = createMockReferral({
        id: "ref-001",
        code: "TESTCODE",
        status: "inactive",
      });
      const kvResult = { ...existing, status: "active" };
      mockReactivateInKV.mockResolvedValue(kvResult);

      await reactivateReferral(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "TESTCODE",
        undefined,
        existing,
      );

      expect(mockReactivateInKV).toHaveBeenCalledWith(
        expect.any(Object),
        "TESTCODE",
        undefined,
        existing,
      );
    });
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
      expect(results[0].code).toBe("CODE1");
      expect(results[0].metadata!.title).toBe("First Deal");
    });

    it("should apply domain filter when provided", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
        { domain: "example.com" },
      );

      const sql = mockD1Client.queryWithJson.mock.calls[0][0];
      expect(sql).toContain("d.domain = ?");
    });

    it("should apply status filter when provided", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
        { status: "inactive" },
      );

      const sql = mockD1Client.queryWithJson.mock.calls[0][0];
      expect(sql).toContain("rc.status = ?");
    });

    it("should include is_active filter when no status is provided", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
      );

      const sql = mockD1Client.queryWithJson.mock.calls[0][0];
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

      const params = mockD1Client.queryWithJson.mock.calls[0][1];
      const lastParam = params[params.length - 1];
      expect(lastParam).toBe(5);
    });

    it("should use default limit of 20 when not specified", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
      );

      const params = mockD1Client.queryWithJson.mock.calls[0][1];
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

      const jsonFields = mockD1Client.queryWithJson.mock.calls[0][2];
      expect(jsonFields).toEqual(["category", "tags"]);
    });

    it("should combine domain and status filters", async () => {
      mockD1Client.queryWithJson.mockResolvedValue({ success: true, data: [] });

      await searchReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        "test",
        { domain: "example.com", status: "active", limit: 10 },
      );

      const sql = mockD1Client.queryWithJson.mock.calls[0][0];
      expect(sql).toContain("d.domain = ?");
      expect(sql).toContain("rc.status = ?");
      const params = mockD1Client.queryWithJson.mock.calls[0][1];
      expect(params).toContain("example.com");
      expect(params).toContain("active");
      expect(params).toContain(10);
    });
  });

  describe("getExpiringReferralsD1", () => {
    it("should return expiring referrals from D1", async () => {
      const d1Rows = [
        {
          code: "EXPCODE1",
          domain: "example.com",
          title: "Expiring Deal",
          expires_at: "2024-06-01",
          days_remaining: 5,
        },
        {
          code: "EXPCODE2",
          domain: "example.org",
          title: "Another Deal",
          expires_at: "2024-06-05",
          days_remaining: 9,
        },
      ];
      mockD1Client.query.mockResolvedValue({ success: true, data: d1Rows });

      const results = await getExpiringReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        30,
      );

      expect(mockD1Client.query).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(2);
      expect(results[0].code).toBe("EXPCODE1");
      expect(results[0].url).toBe("https://example.com");
      expect(results[0].metadata!.title).toBe("Expiring Deal");
      expect(results[1].code).toBe("EXPCODE2");
    });

    it("should use default days value of 30 when not provided", async () => {
      mockD1Client.query.mockResolvedValue({ success: true, data: [] });

      await getExpiringReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      );

      const params = mockD1Client.query.mock.calls[0][1];
      expect(params[0]).toBe(30);
    });

    it("should pass custom days value", async () => {
      mockD1Client.query.mockResolvedValue({ success: true, data: [] });

      await getExpiringReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        7,
      );

      const params = mockD1Client.query.mock.calls[0][1];
      expect(params[0]).toBe(7);
    });

    it("should return empty array when DEALS_DB is undefined", async () => {
      const results = await getExpiringReferralsD1(
        createMockEnv({ DEALS_DB: undefined }),
        30,
      );

      expect(mockD1Client.query).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it("should return empty array when D1 returns no data", async () => {
      mockD1Client.query.mockResolvedValue({ success: true, data: undefined });

      const results = await getExpiringReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        30,
      );

      expect(results).toEqual([]);
    });

    it("should return empty array on D1 error", async () => {
      mockD1Client.query.mockRejectedValue(new Error("Query failed"));

      const results = await getExpiringReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        30,
      );

      expect(results).toEqual([]);
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it("should include ORDER BY days_remaining ASC in the SQL query", async () => {
      mockD1Client.query.mockResolvedValue({ success: true, data: [] });

      await getExpiringReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        30,
      );

      const sql = mockD1Client.query.mock.calls[0][0];
      expect(sql).toContain("ORDER BY days_remaining ASC");
    });

    it("should filter for is_active = 1", async () => {
      mockD1Client.query.mockResolvedValue({ success: true, data: [] });

      await getExpiringReferralsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
        30,
      );

      const sql = mockD1Client.query.mock.calls[0][0];
      expect(sql).toContain("rc.is_active = 1");
    });
  });

  describe("getReferralStatsD1", () => {
    it("should return stats from D1 with totals and domain breakdown", async () => {
      mockD1Client.queryFirst.mockResolvedValue({
        success: true,
        data: { total: 100, active: 75 },
      });
      mockD1Client.query.mockResolvedValue({
        success: true,
        data: [
          { domain: "example.com", count: 40 },
          { domain: "example.org", count: 35 },
        ],
      });

      const result = await getReferralStatsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      );

      expect(mockD1Client.queryFirst).toHaveBeenCalledTimes(1);
      expect(mockD1Client.query).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(100);
      expect(result.active).toBe(75);
      expect(result.byDomain).toHaveLength(2);
      expect(result.byDomain[0]).toEqual({ domain: "example.com", count: 40 });
    });

    it("should run both queries in parallel via Promise.all", async () => {
      let statsResolve: (v: unknown) => void;
      let domainResolve: (v: unknown) => void;
      let statsStarted = false;
      let domainStarted = false;

      mockD1Client.queryFirst.mockImplementation(() =>
        new Promise((resolve) => {
          statsStarted = true;
          statsResolve = resolve;
        }).then(() => ({ success: true, data: { total: 10, active: 5 } })),
      );
      mockD1Client.query.mockImplementation(() =>
        new Promise((resolve) => {
          domainStarted = true;
          domainResolve = resolve;
        }).then(() => ({
          success: true,
          data: [{ domain: "test.com", count: 3 }],
        })),
      );

      const promise = getReferralStatsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      );

      expect(statsStarted).toBe(true);
      expect(domainStarted).toBe(true);

      statsResolve!(null);
      domainResolve!(null);

      const result = await promise;
      expect(result.total).toBe(10);
      expect(result.byDomain).toEqual([{ domain: "test.com", count: 3 }]);
    });

    it("should return zeros when DEALS_DB is undefined", async () => {
      const result = await getReferralStatsD1(
        createMockEnv({ DEALS_DB: undefined }),
      );

      expect(mockD1Client.queryFirst).not.toHaveBeenCalled();
      expect(result).toEqual({ total: 0, active: 0, byDomain: [] });
    });

    it("should return zeros when stats query returns no data", async () => {
      mockD1Client.queryFirst.mockResolvedValue({
        success: true,
        data: undefined,
      });
      mockD1Client.query.mockResolvedValue({ success: true, data: undefined });

      const result = await getReferralStatsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      );

      expect(result).toEqual({ total: 0, active: 0, byDomain: [] });
    });

    it("should return zeros when stats query returns null data", async () => {
      mockD1Client.queryFirst.mockResolvedValue({ success: true, data: null });
      mockD1Client.query.mockResolvedValue({ success: true, data: null });

      const result = await getReferralStatsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      );

      expect(result).toEqual({ total: 0, active: 0, byDomain: [] });
    });

    it("should return zeros on D1 error", async () => {
      mockD1Client.queryFirst.mockRejectedValue(
        new Error("Stats query failed"),
      );

      const result = await getReferralStatsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      );

      expect(result).toEqual({ total: 0, active: 0, byDomain: [] });
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it("should handle partial failure where only domain query returns data", async () => {
      mockD1Client.queryFirst.mockResolvedValue({ success: true, data: null });
      mockD1Client.query.mockResolvedValue({
        success: true,
        data: [{ domain: "test.com", count: 5 }],
      });

      const result = await getReferralStatsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      );

      expect(result.total).toBe(0);
      expect(result.active).toBe(0);
      expect(result.byDomain).toEqual([{ domain: "test.com", count: 5 }]);
    });

    it("should handle partial failure where only stats query returns data", async () => {
      mockD1Client.queryFirst.mockResolvedValue({
        success: true,
        data: { total: 50, active: 30 },
      });
      mockD1Client.query.mockResolvedValue({ success: true, data: undefined });

      const result = await getReferralStatsD1(
        createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      );

      expect(result.total).toBe(50);
      expect(result.active).toBe(30);
      expect(result.byDomain).toEqual([]);
    });
  });
});
