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

import { getReferralStatsD1 } from "../../../worker/lib/referral-storage/dual-write";

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

describe("getReferralStatsD1", () => {
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
    mockD1Client.queryFirst.mockRejectedValue(new Error("Stats query failed"));

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
