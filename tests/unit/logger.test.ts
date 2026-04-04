import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  appendLog,
  getRunLogs,
  getRecentLogs,
  createLogBuilder,
  exportLogsAsJSONL,
} from "../../worker/lib/logger";
import type { LogEntry, Env, PipelinePhase } from "../../worker/types";

describe("Logger", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();

    mockEnv = {
      DEALS_PROD: {} as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`log:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`log:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`log:${key}`);
        }),
        list: vi.fn(async () => ({ keys: [] })),
      } as unknown as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  describe("appendLog", () => {
    it("should append valid log entry", async () => {
      const entry = {
        run_id: "test-run",
        trace_id: "test-trace",
        phase: "discover" as PipelinePhase,
        status: "complete" as const,
        candidate_count: 10,
      };

      await appendLog(mockEnv, entry);

      expect(mockEnv.DEALS_LOG.put).toHaveBeenCalled();
      const putCall = (mockEnv.DEALS_LOG.put as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(putCall[0]).toMatch(/^log:/);
    });

    it("should validate log entry before storing", async () => {
      const invalidEntry = {
        run_id: "test-run",
        trace_id: "test-trace",
        phase: "invalid_phase" as PipelinePhase,
        status: "complete" as const,
      };

      await expect(appendLog(mockEnv, invalidEntry)).rejects.toThrow();
    });

    it("should update log index", async () => {
      const entry = {
        run_id: "test-run",
        trace_id: "test-trace",
        phase: "discover" as PipelinePhase,
        status: "complete" as const,
      };

      await appendLog(mockEnv, entry);

      // Should update index
      const indexPut = (
        mockEnv.DEALS_LOG.put as ReturnType<typeof vi.fn>
      ).mock.calls.find((call) => call[0] === "log:index");
      expect(indexPut).toBeDefined();
    });

    it("should maintain run-specific list", async () => {
      const entry = {
        run_id: "test-run",
        trace_id: "test-trace",
        phase: "discover" as PipelinePhase,
        status: "complete" as const,
      };

      await appendLog(mockEnv, entry);

      // Should create run list
      const runPut = (
        mockEnv.DEALS_LOG.put as ReturnType<typeof vi.fn>
      ).mock.calls.find((call) => call[0] === "run:test-run");
      expect(runPut).toBeDefined();
    });

    it("should handle errors gracefully", async () => {
      mockEnv.DEALS_LOG.put = vi.fn(async () => {
        throw new Error("KV error");
      });

      const entry = {
        run_id: "test-run",
        trace_id: "test-trace",
        phase: "discover" as PipelinePhase,
        status: "complete" as const,
      };

      await expect(appendLog(mockEnv, entry)).rejects.toThrow(
        "Log append failed",
      );
    });
  });

  describe("getRunLogs", () => {
    it("should retrieve logs for specific run", async () => {
      // Setup mock data
      mockKvStorage.set("log:run:test-run", [
        "log:0000000001",
        "log:0000000002",
      ]);
      mockKvStorage.set("log:log:0000000001", {
        run_id: "test-run",
        trace_id: "test-trace",
        phase: "discover",
        status: "complete",
        ts: "2024-03-31T00:00:00Z",
      } as LogEntry);
      mockKvStorage.set("log:log:0000000002", {
        run_id: "test-run",
        trace_id: "test-trace",
        phase: "publish",
        status: "complete",
        ts: "2024-03-31T00:00:01Z",
      } as LogEntry);

      const logs = await getRunLogs(mockEnv, "test-run");

      expect(logs).toHaveLength(2);
      expect(logs[0].phase).toBe("discover");
      expect(logs[1].phase).toBe("publish");
    });

    it("should return empty array for unknown run", async () => {
      const logs = await getRunLogs(mockEnv, "unknown-run");

      expect(logs).toEqual([]);
    });

    it("should sort logs by timestamp", async () => {
      mockKvStorage.set("log:run:test-run", [
        "log:0000000001",
        "log:0000000002",
      ]);
      mockKvStorage.set("log:log:0000000001", {
        run_id: "test-run",
        trace_id: "test-trace",
        phase: "publish",
        status: "complete",
        ts: "2024-03-31T00:00:01Z",
      } as LogEntry);
      mockKvStorage.set("log:log:0000000002", {
        run_id: "test-run",
        trace_id: "test-trace",
        phase: "discover",
        status: "complete",
        ts: "2024-03-31T00:00:00Z",
      } as LogEntry);

      const logs = await getRunLogs(mockEnv, "test-run");

      expect(logs[0].phase).toBe("discover");
      expect(logs[1].phase).toBe("publish");
    });
  });

  describe("getRecentLogs", () => {
    it("should retrieve recent logs", async () => {
      mockKvStorage.set("log:log:index", {
        total_entries: 5,
        last_entry_key: "log:0000000005",
        last_run_id: "test-run",
      });

      for (let i = 1; i <= 5; i++) {
        mockKvStorage.set(`log:log:${String(i).padStart(10, "0")}`, {
          run_id: "test-run",
          trace_id: "test-trace",
          phase: "discover",
          status: "complete",
          ts: `2024-03-31T00:00:0${i}Z`,
        } as LogEntry);
      }

      const logs = await getRecentLogs(mockEnv, 3);

      expect(logs).toHaveLength(3);
    });

    it("should handle empty log storage", async () => {
      const logs = await getRecentLogs(mockEnv, 10);

      expect(logs).toEqual([]);
    });

    it("should limit to available entries", async () => {
      mockKvStorage.set("log:log:index", {
        total_entries: 2,
        last_entry_key: "log:0000000002",
        last_run_id: "test-run",
      });

      for (let i = 1; i <= 2; i++) {
        mockKvStorage.set(`log:log:${String(i).padStart(10, "0")}`, {
          run_id: "test-run",
          trace_id: "test-trace",
          phase: "discover",
          status: "complete",
          ts: `2024-03-31T00:00:0${i}Z`,
        } as LogEntry);
      }

      const logs = await getRecentLogs(mockEnv, 10);

      expect(logs).toHaveLength(2);
    });
  });

  describe("createLogBuilder", () => {
    it("should create log entry with builder pattern", () => {
      const builder = createLogBuilder("run-1", "trace-1")
        .phase("discover")
        .status("complete")
        .counts({ candidate: 10, valid: 8 })
        .duration(5000);

      const entry = builder.build();

      expect(entry.run_id).toBe("run-1");
      expect(entry.trace_id).toBe("trace-1");
      expect(entry.phase).toBe("discover");
      expect(entry.status).toBe("complete");
      expect(entry.candidate_count).toBe(10);
      expect(entry.valid_count).toBe(8);
      expect(entry.duration_ms).toBe(5000);
    });

    it("should record error details", () => {
      const builder = createLogBuilder("run-1", "trace-1")
        .phase("validate")
        .error("ValidationError", "Schema validation failed");

      const entry = builder.build();

      expect(entry.error_class).toBe("ValidationError");
      expect(entry.error_message).toBe("Schema validation failed");
      expect(entry.status).toBe("error");
    });

    it("should record rejection reasons", () => {
      const builder = createLogBuilder("run-1", "trace-1")
        .phase("validate")
        .reasons(["low_trust", "expired_deal"]);

      const entry = builder.build();

      expect(entry.rejection_reasons).toEqual(["low_trust", "expired_deal"]);
    });

    it("should record scores", () => {
      const builder = createLogBuilder("run-1", "trace-1")
        .phase("score")
        .scores({ confidence: 0.85, trust: 0.9 });

      const entry = builder.build();

      expect(entry.confidence_score).toBe(0.85);
      expect(entry.trust_score).toBe(0.9);
    });

    it("should record source information", () => {
      const builder = createLogBuilder("run-1", "trace-1")
        .phase("discover")
        .sources(["https://example.com"], ["hash1"]);

      const entry = builder.build();

      expect(entry.source_urls).toEqual(["https://example.com"]);
      expect(entry.source_hashes).toEqual(["hash1"]);
    });

    it("should record snapshot hashes", () => {
      const builder = createLogBuilder("run-1", "trace-1")
        .phase("publish")
        .hashes("prev-hash", "new-hash");

      const entry = builder.build();

      expect(entry.previous_snapshot_hash).toBe("prev-hash");
      expect(entry.new_snapshot_hash).toBe("new-hash");
    });

    it("should record versions", () => {
      const builder = createLogBuilder("run-1", "trace-1")
        .phase("publish")
        .versions("0.1.3", "0.1.3");

      const entry = builder.build();

      expect(entry.validator_versions).toBe("0.1.3");
      expect(entry.schema_version).toBe("0.1.3");
    });

    it("should record notification status", () => {
      const builder = createLogBuilder("run-1", "trace-1")
        .phase("finalize")
        .notify(true);

      const entry = builder.build();

      expect(entry.notification_sent).toBe(true);
    });

    it("should record retry count", () => {
      const builder = createLogBuilder("run-1", "trace-1")
        .phase("validate")
        .retry(2);

      const entry = builder.build();

      expect(entry.retry_count).toBe(2);
    });
  });

  describe("exportLogsAsJSONL", () => {
    it("should export logs as JSONL", async () => {
      mockKvStorage.set("log:log:index", {
        total_entries: 2,
        last_entry_key: "log:0000000002",
        last_run_id: "test-run",
      });

      mockKvStorage.set("log:log:0000000001", {
        run_id: "test-run",
        trace_id: "trace-1",
        phase: "discover",
        status: "complete",
        ts: "2024-03-31T00:00:00Z",
      } as LogEntry);
      mockKvStorage.set("log:log:0000000002", {
        run_id: "test-run",
        trace_id: "trace-1",
        phase: "publish",
        status: "complete",
        ts: "2024-03-31T00:00:01Z",
      } as LogEntry);

      const jsonl = await exportLogsAsJSONL(mockEnv);

      const lines = jsonl.split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).phase).toBe("discover");
      expect(JSON.parse(lines[1]).phase).toBe("publish");
    });

    it("should handle empty logs", async () => {
      const jsonl = await exportLogsAsJSONL(mockEnv);

      expect(jsonl).toBe("");
    });
  });
});
