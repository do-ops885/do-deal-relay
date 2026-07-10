import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../../worker/types";

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
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

vi.mock("../../../worker/lib/d1/client", () => ({
  createD1Client: mockCreateD1Client,
  createD1ReadClient: mockCreateD1Client,
}));

import { getExpiringReferralsD1 } from "../../../worker/lib/referral-storage/dual-write";

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

describe("getExpiringReferralsD1", () => {
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
    expect(results[0]!.code).toBe("EXPCODE1");
    expect(results[0]!.url).toBe("https://example.com");
    expect(results[0]!.metadata!.title).toBe("Expiring Deal");
    expect(results[1]!.code).toBe("EXPCODE2");
  });

  it("should use default days value of 30 when not provided", async () => {
    mockD1Client.query.mockResolvedValue({ success: true, data: [] });

    await getExpiringReferralsD1(
      createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
    );

    const params = mockD1Client.query.mock.calls[0]![1];
    expect(params[0]).toBe(30);
  });

  it("should pass custom days value", async () => {
    mockD1Client.query.mockResolvedValue({ success: true, data: [] });

    await getExpiringReferralsD1(
      createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      7,
    );

    const params = mockD1Client.query.mock.calls[0]![1];
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

    const sql = mockD1Client.query.mock.calls[0]![0];
    expect(sql).toContain("ORDER BY days_remaining ASC");
  });

  it("should filter for is_active = 1", async () => {
    mockD1Client.query.mockResolvedValue({ success: true, data: [] });

    await getExpiringReferralsD1(
      createMockEnv({ DEALS_DB: {} as unknown as Env["DEALS_DB"] }),
      30,
    );

    const sql = mockD1Client.query.mock.calls[0]![0];
    expect(sql).toContain("rc.is_active = 1");
  });
});
