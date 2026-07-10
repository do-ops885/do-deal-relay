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
  // logOperation
  // =========================================================================

  describe("logOperation", () => {
    const baseEntry: AIActLogEntry = {
      timestamp: "2024-06-15T12:00:00Z",
      systemId: "test-system",
      operationId: "op-1",
      operation: "test_op",
      operationVersion: "1.0.0",
      inputData: {
        source: "test_source",
        hash: "abc123",
        description: "Test input",
      },
      outputData: {
        result: "success",
      },
    };

    it("should insert a log entry and return the generated UUID", async () => {
      const id = await logger.logOperation(baseEntry);

      expect(id).toBe("test-uuid-1234");
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO ai_act_logs"),
      );
      expect(mockRun).toHaveBeenCalled();
    });

    it("should bind all required fields in correct order", async () => {
      await logger.logOperation(baseEntry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[0]).toBe("test-uuid-1234");
      expect(bindings[1]).toBe("2024-06-15T12:00:00Z");
      expect(bindings[2]).toBe("test-system");
      expect(bindings[3]).toBe("op-1");
      expect(bindings[4]).toBeNull();
      expect(bindings[5]).toBe("test_op");
      expect(bindings[6]).toBe("1.0.0");
      expect(bindings[7]).toBe("test_source");
      expect(bindings[8]).toBe("abc123");
      expect(bindings[9]).toBe("Test input");
      expect(bindings[10]).toBeNull();
      expect(bindings[11]).toBeNull();
      expect(bindings[12]).toBeNull();
      expect(bindings[13]).toBe("success");
      expect(bindings[14]).toBeNull();
      expect(bindings[15]).toBeNull();
      expect(bindings[16]).toBeNull();
      expect(bindings[25]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(bindings[26]).toBe(1);
      expect(bindings[27]).toBe(1);
      expect(bindings[28]).toBe(1);
    });

    it("should use default systemId when entry.systemId is missing", async () => {
      const entry = { ...baseEntry, systemId: undefined } as any;
      await logger.logOperation(entry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[2]).toBe("test-system");
    });

    it("should use default operationVersion when entry.operationVersion is missing", async () => {
      const entry = { ...baseEntry, operationVersion: undefined } as any;
      await logger.logOperation(entry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[6]).toBe("1.0.0");
    });

    it("should serialize inputData.metadata as JSON", async () => {
      const entry: AIActLogEntry = {
        ...baseEntry,
        inputData: {
          ...baseEntry.inputData,
          metadata: { key: "value", nested: { a: 1 } },
        },
      };
      await logger.logOperation(entry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[12]).toBe('{"key":"value","nested":{"a":1}}');
    });

    it("should serialize riskFlags as JSON array", async () => {
      const entry: AIActLogEntry = {
        ...baseEntry,
        riskFlags: ["flag1", "flag2"],
      };
      await logger.logOperation(entry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[22]).toBe('["flag1","flag2"]');
    });

    it("should serialize anomalies as JSON array", async () => {
      const entry: AIActLogEntry = {
        ...baseEntry,
        anomalies: ["anomaly1"],
      };
      await logger.logOperation(entry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[23]).toBe('["anomaly1"]');
    });

    it("should serialize performanceMetrics as JSON", async () => {
      const entry: AIActLogEntry = {
        ...baseEntry,
        performanceMetrics: { accuracy: 0.95, latencyMs: 120 },
      };
      await logger.logOperation(entry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[24]).toBe('{"accuracy":0.95,"latencyMs":120}');
    });

    it("should bind human oversight fields when present", async () => {
      const entry: AIActLogEntry = {
        ...baseEntry,
        humanOversight: {
          reviewerId: "rev-1",
          reviewerRole: "admin",
          decision: "approved",
          timestamp: "2024-06-15T12:05:00Z",
          notes: "Looks good",
        },
      };
      await logger.logOperation(entry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[17]).toBe("rev-1");
      expect(bindings[18]).toBe("admin");
      expect(bindings[19]).toBe("approved");
      expect(bindings[20]).toBe("2024-06-15T12:05:00Z");
      expect(bindings[21]).toBe("Looks good");
    });

    it("should use custom retentionDays when provided", async () => {
      const entry: AIActLogEntry = {
        ...baseEntry,
        retentionDays: 30,
      };
      await logger.logOperation(entry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      const retentionDate = new Date(bindings[25] as string);
      const expected = new Date("2024-06-15T12:00:00Z");
      expected.setDate(expected.getDate() + 30);
      expect(retentionDate.toISOString()).toBe(expected.toISOString());
    });

    it("should use default retentionDays when not specified", async () => {
      await logger.logOperation(baseEntry);

      const bindings = mockBind.mock.calls[0] as unknown[];
      const retentionDate = new Date(bindings[25] as string);
      const expected = new Date("2024-06-15T12:00:00Z");
      expected.setDate(expected.getDate() + 180);
      expect(retentionDate.toISOString()).toBe(expected.toISOString());
    });

    it("should propagate database errors", async () => {
      mockRun.mockRejectedValue(new Error("DB write failed"));

      await expect(logger.logOperation(baseEntry)).rejects.toThrow(
        "DB write failed",
      );
    });
  });

  // =========================================================================
  // logHumanOversight
  // =========================================================================

  describe("logHumanOversight", () => {
    it("should log an oversight action with original output hash", async () => {
      await logger.logHumanOversight({
        operationId: "op-1",
        reviewerId: "rev-1",
        reviewerRole: "admin",
        decision: "approved",
        originalOutput: { score: 0.9 },
      });

      expect(mockRun).toHaveBeenCalled();
      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[5]).toBe("human_oversight");
      expect(bindings[7]).toBe("human_intervention");
      expect(bindings[13]).toBe("approved");
      expect(bindings[17]).toBe("rev-1");
      expect(bindings[18]).toBe("admin");
      expect(bindings[19]).toBe("approved");
    });

    it("should use 'no_original' hash when originalOutput is missing", async () => {
      await logger.logHumanOversight({
        operationId: "op-1",
        reviewerId: "rev-1",
        reviewerRole: "admin",
        decision: "rejected",
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[8]).toBe("no_original");
    });

    it("should include reason in explanation and notes", async () => {
      await logger.logHumanOversight({
        operationId: "op-1",
        reviewerId: "rev-1",
        reviewerRole: "admin",
        decision: "modified",
        reason: "Output needed correction",
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[15]).toBe("Output needed correction");
      expect(bindings[21]).toBe("Output needed correction");
    });

    it("should use default explanation when reason is not provided", async () => {
      await logger.logHumanOversight({
        operationId: "op-1",
        reviewerId: "rev-1",
        reviewerRole: "admin",
        decision: "overridden",
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[15]).toBe("Output overridden by human reviewer");
    });

    it("should forward modifiedOutput as metadata", async () => {
      const modified = { newScore: 0.75 };
      await logger.logHumanOversight({
        operationId: "op-1",
        reviewerId: "rev-1",
        reviewerRole: "admin",
        decision: "modified",
        modifiedOutput: modified,
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[12]).toBe(JSON.stringify(modified));
    });

    it("should include correlationId when provided", async () => {
      await logger.logHumanOversight({
        operationId: "op-1",
        reviewerId: "rev-1",
        reviewerRole: "admin",
        decision: "approved",
        correlationId: "corr-abc",
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[4]).toBe("corr-abc");
    });
  });

  // =========================================================================
  // logAnomaly
  // =========================================================================

  describe("logAnomaly", () => {
    it("should log an anomaly with severity and type in riskFlags", async () => {
      await logger.logAnomaly({
        operation: "deal_scoring",
        anomalyType: "outlier_detection",
        severity: "high",
        description: "Score exceeded threshold",
      });

      expect(mockRun).toHaveBeenCalled();
      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[5]).toBe("deal_scoring");
      expect(bindings[7]).toBe("anomaly_detection");
      expect(bindings[13]).toBe("anomaly_high");
      expect(bindings[22]).toBe('["outlier_detection","severity_high"]');
    });

    it("should include description in anomalies array", async () => {
      await logger.logAnomaly({
        operation: "scoring",
        anomalyType: "drift",
        severity: "low",
        description: "Minor drift detected",
        affectedOperations: ["op-1", "op-2"],
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[23]).toBe('["Minor drift detected","op-1","op-2"]');
    });

    it("should produce anomalies array with only description when no affectedOperations", async () => {
      await logger.logAnomaly({
        operation: "scoring",
        anomalyType: "drift",
        severity: "medium",
        description: "Drift detected",
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[23]).toBe('["Drift detected"]');
    });

    it("should include correlationId when provided", async () => {
      await logger.logAnomaly({
        operation: "scoring",
        anomalyType: "error",
        severity: "critical",
        description: "System failure",
        correlationId: "corr-xyz",
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[4]).toBe("corr-xyz");
    });
  });

  // =========================================================================
  // logSyntheticContent
  // =========================================================================

  describe("logSyntheticContent", () => {
    it("should log marked content with watermark info", async () => {
      await logger.logSyntheticContent({
        contentId: "content-1",
        contentType: "text",
        generationMethod: "llm",
        marked: true,
        watermarkMethod: "invisible_tag",
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[5]).toBe("synthetic_content_generation");
      expect(bindings[7]).toBe("ai_generation");
      expect(bindings[8]).toBe("content-1");
      expect(bindings[9]).toBe("AI-generated text via llm");
      expect(bindings[13]).toBe("content_marked");
      expect(bindings[15]).toBe(
        "Content marked as AI-generated using invisible_tag",
      );
    });

    it("should log unmarked content without watermark", async () => {
      await logger.logSyntheticContent({
        contentId: "content-2",
        contentType: "image",
        generationMethod: "diffusion",
        marked: false,
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[13]).toBe("content_unmarked");
      expect(bindings[15]).toBe("Content generated but marking not applied");
    });

    it("should serialize content metadata with watermarkMethod", async () => {
      await logger.logSyntheticContent({
        contentId: "content-3",
        contentType: "audio",
        generationMethod: "tts",
        marked: true,
        watermarkMethod: "freq_embedding",
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[12]).toBe(
        JSON.stringify({
          contentType: "audio",
          marked: true,
          watermarkMethod: "freq_embedding",
        }),
      );
    });

    it("should serialize content metadata without watermarkMethod when absent", async () => {
      await logger.logSyntheticContent({
        contentId: "content-4",
        contentType: "video",
        generationMethod: "genai",
        marked: false,
      });

      const bindings = mockBind.mock.calls[0] as unknown[];
      expect(bindings[12]).toBe(
        JSON.stringify({
          contentType: "video",
          marked: false,
          watermarkMethod: undefined,
        }),
      );
    });
  });
});
