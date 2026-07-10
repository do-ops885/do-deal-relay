import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, ReferralInput } from "../../../worker/types";

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}));

const { mockDeactivateInKV, mockReactivateInKV } = vi.hoisted(() => ({
  mockDeactivateInKV: vi.fn(),
  mockReactivateInKV: vi.fn(),
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
  deactivateReferral: mockDeactivateInKV,
  reactivateReferral: mockReactivateInKV,
}));

vi.mock("../../../worker/lib/d1/client", () => ({
  createD1Client: mockCreateD1Client,
  createD1ReadClient: mockCreateD1Client,
}));

import {
  deactivateReferral,
  reactivateReferral,
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

describe("deactivateReferral and reactivateReferral", () => {
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
      const executeCall = mockD1Client.execute.mock.calls[0]!;
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

      const params = mockD1Client.execute.mock.calls[0]![1];
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
      );
      expect(mockD1Client.execute).toHaveBeenCalledTimes(1);
      const executeCall = mockD1Client.execute.mock.calls[0]!;
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
      );

      expect(mockReactivateInKV).toHaveBeenCalledWith(
        expect.any(Object),
        "TESTCODE",
        undefined,
      );
    });
  });
});
