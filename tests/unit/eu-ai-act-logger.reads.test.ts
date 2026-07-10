import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  EUAIActLogger,
  createComplianceLogger,
  getRetentionPolicy,
  type ComplianceConfig,
  type AIActLogEntry,
} from "../../worker/lib/eu-ai-act-logger";

vi.mock("../../worker/config", () => ({
  CONFIG: {
    VERSION: "0.1.8",
  },
}));

// ============================================================================
// Test Setup & Mocks
// ============================================================================

describe("EUAIActLogger", () => {
  const mockRun = vi.fn();
  const mockAll = vi.fn();
  const mockBind = vi.fn();

  const mockStatement = {
    bind: mockBind,
    run: mockRun,
    all: mockAll,
  };

  const mockPrepare = vi.fn().mockReturnValue(mockStatement);

  const mockDb = {
    prepare: mockPrepare,
  } as any;

  const defaultConfig: ComplianceConfig = {
    systemId: "test-system",
    systemVersion: "1.0.0",
    providerName: "test-provider",
    providerContact: "test@example.com",
    intendedPurpose: "Testing",
    riskClassification: "limited_risk",
    defaultRetentionDays: 180,
  };

  let logger: EUAIActLogger;

  const originalCrypto = global.crypto;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));

    const mockUuid = vi.fn().mockReturnValue("test-uuid-1234");
    const mockCryptoSubtle = {
      digest: vi
        .fn()
        .mockImplementation(async (_algo: string, data: ArrayBuffer) => {
          const view = new Uint8Array(data);
          const hash = new Uint8Array(32);
          for (let i = 0; i < 32; i++) {
            hash[i] = (view[i % view.length]! + i) % 256;
          }
          return hash.buffer;
        }),
    };

    Object.defineProperty(global, "crypto", {
      value: {
        subtle: mockCryptoSubtle,
        randomUUID: mockUuid,
      },
      writable: true,
      configurable: true,
    });

    mockBind.mockReturnValue(mockStatement);
    mockRun.mockResolvedValue({ meta: { changes: 0 } });
    mockAll.mockResolvedValue({ results: [] });

    logger = new EUAIActLogger(mockDb, defaultConfig);
  });

  // =========================================================================
  // getTransparencyDisclosure
  // =========================================================================

  describe("getTransparencyDisclosure", () => {
    it("should return a disclosure containing all config values", () => {
      const disclosure = logger.getTransparencyDisclosure();

      expect(disclosure).toContain("test-system");
      expect(disclosure).toContain("test-provider");
      expect(disclosure).toContain("test@example.com");
      expect(disclosure).toContain("Testing");
      expect(disclosure).toContain("limited_risk");
      expect(disclosure).toContain("Article 50.1");
    });

    it("should update when config changes", () => {
      const customLogger = new EUAIActLogger(mockDb, {
        ...defaultConfig,
        systemId: "custom-sys",
        providerName: "custom-provider",
      });

      const disclosure = customLogger.getTransparencyDisclosure();
      expect(disclosure).toContain("custom-sys");
      expect(disclosure).toContain("custom-provider");
    });
  });

  // =========================================================================
  // queryLogs
  // =========================================================================

  describe("queryLogs", () => {
    it("should query with base SQL when no filters provided", async () => {
      await logger.queryLogs({});

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM ai_act_logs WHERE 1=1"),
      );
      expect(mockBind).toHaveBeenCalledWith();
    });

    it("should append startDate filter", async () => {
      await logger.queryLogs({ startDate: "2024-01-01" });

      const sql = mockPrepare.mock.calls[0]![0] as string;
      expect(sql).toContain("timestamp >= ?");
      expect(mockBind).toHaveBeenCalledWith("2024-01-01");
    });

    it("should append endDate filter", async () => {
      await logger.queryLogs({ endDate: "2024-12-31" });

      const sql = mockPrepare.mock.calls[0]![0] as string;
      expect(sql).toContain("timestamp <= ?");
    });

    it("should append operation filter", async () => {
      await logger.queryLogs({ operation: "deal_scoring" });

      const sql = mockPrepare.mock.calls[0]![0] as string;
      expect(sql).toContain("operation = ?");
      expect(mockBind).toHaveBeenCalledWith("deal_scoring");
    });

    it("should append systemId filter", async () => {
      await logger.queryLogs({ systemId: "sys-1" });

      const sql = mockPrepare.mock.calls[0]![0] as string;
      expect(sql).toContain("system_id = ?");
      expect(mockBind).toHaveBeenCalledWith("sys-1");
    });

    it("should append hasHumanOversight filter", async () => {
      await logger.queryLogs({ hasHumanOversight: true });

      const sql = mockPrepare.mock.calls[0]![0] as string;
      expect(sql).toContain("oversight_decision IS NOT NULL");
    });

    it("should append hasRiskFlags filter", async () => {
      await logger.queryLogs({ hasRiskFlags: true });

      const sql = mockPrepare.mock.calls[0]![0] as string;
      expect(sql).toContain("risk_flags IS NOT NULL");
    });

    it("should append LIMIT clause", async () => {
      await logger.queryLogs({ limit: 10 });

      const sql = mockPrepare.mock.calls[0]![0] as string;
      expect(sql).toContain("LIMIT ?");
      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings).toContain(10);
    });

    it("should order by timestamp DESC", async () => {
      await logger.queryLogs({});

      const sql = mockPrepare.mock.calls[0]![0] as string;
      expect(sql).toContain("ORDER BY timestamp DESC");
    });

    it("should combine multiple filters", async () => {
      await logger.queryLogs({
        startDate: "2024-01-01",
        endDate: "2024-06-30",
        operation: "test",
        hasHumanOversight: true,
        limit: 5,
      });

      const sql = mockPrepare.mock.calls[0]![0] as string;
      expect(sql).toContain("timestamp >= ?");
      expect(sql).toContain("timestamp <= ?");
      expect(sql).toContain("operation = ?");
      expect(sql).toContain("oversight_decision IS NOT NULL");
      expect(sql).toContain("LIMIT ?");
      expect(mockBind).toHaveBeenCalledWith(
        "2024-01-01",
        "2024-06-30",
        "test",
        5,
      );
    });

    it("should return results from the query", async () => {
      const mockResults = [{ id: "1" }, { id: "2" }];
      mockAll.mockResolvedValue({ results: mockResults });

      const results = await logger.queryLogs({});
      expect(results).toEqual(mockResults);
    });

    it("should return empty array when no results", async () => {
      mockAll.mockResolvedValue({ results: undefined });

      const results = await logger.queryLogs({});
      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // getComplianceSummary
  // =========================================================================

  describe("getComplianceSummary", () => {
    it("should return zeroed summary when no data exists", async () => {
      mockAll.mockResolvedValue({ results: [] });

      const summary = await logger.getComplianceSummary(
        "2024-01-01",
        "2024-06-30",
      );

      expect(summary).toEqual({
        totalOperations: 0,
        operationsByType: {},
        humanOversightCount: 0,
        riskFlaggedCount: 0,
        averageConfidence: undefined,
      });
    });

    it("should aggregate multiple operation types", async () => {
      mockAll.mockResolvedValue({
        results: [
          {
            operation: "deal_scoring",
            count: 10,
            oversight_count: 3,
            risk_count: 1,
            avg_confidence: 0.85,
          },
          {
            operation: "human_oversight",
            count: 5,
            oversight_count: 5,
            risk_count: 0,
            avg_confidence: null,
          },
        ],
      });

      const summary = await logger.getComplianceSummary(
        "2024-01-01",
        "2024-06-30",
      );

      expect(summary.totalOperations).toBe(15);
      expect(summary.operationsByType).toEqual({
        deal_scoring: 10,
        human_oversight: 5,
      });
      expect(summary.humanOversightCount).toBe(8);
      expect(summary.riskFlaggedCount).toBe(1);
      expect(summary.averageConfidence).toBe(0.85);
    });

    it("should average confidence only across non-null values", async () => {
      mockAll.mockResolvedValue({
        results: [
          {
            operation: "op1",
            count: 1,
            oversight_count: 0,
            risk_count: 0,
            avg_confidence: 0.9,
          },
          {
            operation: "op2",
            count: 1,
            oversight_count: 0,
            risk_count: 0,
            avg_confidence: null,
          },
          {
            operation: "op3",
            count: 1,
            oversight_count: 0,
            risk_count: 0,
            avg_confidence: 0.7,
          },
        ],
      });

      const summary = await logger.getComplianceSummary(
        "2024-01-01",
        "2024-06-30",
      );

      expect(summary.averageConfidence).toBeCloseTo(0.8);
    });

    it("should return undefined averageConfidence when all are null", async () => {
      mockAll.mockResolvedValue({
        results: [
          {
            operation: "op1",
            count: 1,
            oversight_count: 0,
            risk_count: 0,
            avg_confidence: null,
          },
        ],
      });

      const summary = await logger.getComplianceSummary(
        "2024-01-01",
        "2024-06-30",
      );

      expect(summary.averageConfidence).toBeUndefined();
    });

    it("should pass startDate and endDate to the SQL query", async () => {
      await logger.getComplianceSummary("2024-01-01", "2024-12-31");

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("WHERE timestamp >= ? AND timestamp <= ?"),
      );
      expect(mockBind).toHaveBeenCalledWith("2024-01-01", "2024-12-31");
    });
  });

  // =========================================================================
  // cleanupExpiredLogs
  // =========================================================================

  describe("cleanupExpiredLogs", () => {
    it("should delete expired logs and return count", async () => {
      mockRun.mockResolvedValue({ meta: { changes: 42 } });

      const count = await logger.cleanupExpiredLogs();

      expect(count).toBe(42);
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM ai_act_logs"),
      );
      expect(mockRun).toHaveBeenCalled();
    });

    it("should return 0 when no logs are deleted", async () => {
      mockRun.mockResolvedValue({ meta: { changes: 0 } });

      const count = await logger.cleanupExpiredLogs();
      expect(count).toBe(0);
    });

    it("should return 0 when meta.changes is undefined", async () => {
      mockRun.mockResolvedValue({ meta: {} });

      const count = await logger.cleanupExpiredLogs();
      expect(count).toBe(0);
    });

    it("should propagate database errors", async () => {
      mockRun.mockRejectedValue(new Error("Delete failed"));

      await expect(logger.cleanupExpiredLogs()).rejects.toThrow(
        "Delete failed",
      );
    });
  });
});

// ============================================================================
// Convenience Functions
// ============================================================================

describe("createComplianceLogger", () => {
  const mockDb = { prepare: vi.fn() } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a logger with default config", () => {
    const logger = createComplianceLogger(mockDb);

    expect(logger).toBeInstanceOf(EUAIActLogger);
  });

  it("should override default config with partial config", () => {
    const logger = createComplianceLogger(mockDb, {
      systemId: "custom-id",
      riskClassification: "high_risk",
    });

    const disclosure = logger.getTransparencyDisclosure();
    expect(disclosure).toContain("custom-id");
    expect(disclosure).toContain("high_risk");
  });

  it("should use default values for unspecified fields", () => {
    const logger = createComplianceLogger(mockDb, { systemId: "override" });

    const disclosure = logger.getTransparencyDisclosure();
    expect(disclosure).toContain("override");
    expect(disclosure).toContain("do-ops");
    expect(disclosure).toContain("compliance@do-ops.dev");
  });
});

describe("getRetentionPolicy", () => {
  it("should return 180 days for default/undefined system type", () => {
    expect(getRetentionPolicy()).toBe(180);
    expect(getRetentionPolicy(undefined)).toBe(180);
  });

  it("should return 180 days for unknown system type", () => {
    expect(getRetentionPolicy("unknown")).toBe(180);
  });

  it("should return 2555 days for financial", () => {
    expect(getRetentionPolicy("financial")).toBe(2555);
  });

  it("should return 2555 days for healthcare", () => {
    expect(getRetentionPolicy("healthcare")).toBe(2555);
  });

  it("should return 3650 days for legal", () => {
    expect(getRetentionPolicy("legal")).toBe(3650);
  });
});
