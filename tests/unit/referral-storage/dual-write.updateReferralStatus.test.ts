import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, ReferralInput } from "../../../worker/types";

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}));

const { mockUpdateInKV } = vi.hoisted(() => ({
  mockUpdateInKV: vi.fn(),
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
  updateReferralStatus: mockUpdateInKV,
}));

vi.mock("../../../worker/lib/d1/client", () => ({
  createD1Client: mockCreateD1Client,
  createD1ReadClient: mockCreateD1Client,
}));

import { updateReferralStatus } from "../../../worker/lib/referral-storage/dual-write";

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

describe("updateReferralStatus", () => {
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
    const executeCall = mockD1Client.execute.mock.calls[0]!;
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

    const params = mockD1Client.execute.mock.calls[0]![1];
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

    const params = mockD1Client.execute.mock.calls[0]![1];
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
