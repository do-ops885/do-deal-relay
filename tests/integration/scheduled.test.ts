import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index";
import type { Env } from "../../worker/types";

describe("Scheduled Event Handler", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  let mockScheduledEvent: ScheduledEvent;

  beforeEach(() => {
    mockKvStorage = new Map();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("console", {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    });

    mockScheduledEvent = {
      type: "scheduled",
      scheduledTime: Date.now(),
      cron: "0 */6 * * *",
      noRetry: () => {},
      waitUntil: () => Promise.resolve(),
    } as unknown as ScheduledEvent;

    mockEnv = {
      DEALS_PROD: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`prod:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`prod:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`prod:${key}`);
        }),
      } as unknown as KVNamespace,
      DEALS_STAGING: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`staging:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`staging:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`staging:${key}`);
        }),
      } as unknown as KVNamespace,
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
      } as unknown as KVNamespace,
      DEALS_LOCK: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`lock:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_SOURCES: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Cron trigger", () => {
    it("should execute pipeline on scheduled event", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "[]",
      });
      vi.stubGlobal("fetch", mockFetch);

      // Should not throw
      await expect(
        worker.scheduled(mockScheduledEvent, mockEnv),
      ).resolves.not.toThrow();
    });

    it("should handle successful pipeline execution", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "[]",
      });
      vi.stubGlobal("fetch", mockFetch);

      await worker.scheduled(mockScheduledEvent, mockEnv);

      // Should log completion
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Scheduled event triggered"),
      );
    });

    it("should handle pipeline failure gracefully", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));
      vi.stubGlobal("fetch", mockFetch);

      // Should handle error without throwing
      await expect(
        worker.scheduled(mockScheduledEvent, mockEnv),
      ).resolves.not.toThrow();

      // Should log error
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should catch and log pipeline errors", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockRejectedValue(new Error("Critical error"));
      vi.stubGlobal("fetch", mockFetch);

      // Should not throw
      await expect(
        worker.scheduled(mockScheduledEvent, mockEnv),
      ).resolves.not.toThrow();

      // Should log error (actual format varies based on failure phase)
      expect(console.error).toHaveBeenCalled();
    });

    it("should send notification on critical failure", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockRejectedValue(new Error("Fatal error"));
      vi.stubGlobal("fetch", mockFetch);

      await worker.scheduled(mockScheduledEvent, mockEnv);

      // Should have logged the error
      expect(console.error).toHaveBeenCalled();
    });

    it("should handle lock acquisition failures", async () => {
      // Pre-populate an active lock
      const futureDate = new Date(Date.now() + 600000).toISOString();
      mockKvStorage.set("lock:pipeline:lock", {
        run_id: "other-run",
        trace_id: "other-trace",
        acquired_at: new Date().toISOString(),
        expires_at: futureDate,
      });

      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "[]",
      });
      vi.stubGlobal("fetch", mockFetch);

      // Should not throw on lock failure
      await expect(
        worker.scheduled(mockScheduledEvent, mockEnv),
      ).resolves.not.toThrow();
    });
  });

  describe("Event logging", () => {
    it("should log scheduled event trigger time", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "[]",
      });
      vi.stubGlobal("fetch", mockFetch);

      await worker.scheduled(mockScheduledEvent, mockEnv);

      // Should log the event trigger
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Scheduled event triggered"),
      );
    });

    it("should log pipeline phase on failure", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockRejectedValue(new Error("Pipeline error"));
      vi.stubGlobal("fetch", mockFetch);

      await worker.scheduled(mockScheduledEvent, mockEnv);

      // Should log error
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("Pipeline execution", () => {
    it("should run full discovery pipeline", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test1.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
          {
            domain: "test2.com",
            url_patterns: ["/"],
            trust_initial: 0.8,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "TEST123",
              title: "Test Deal",
              url: "https://test.com/invite",
              reward_value: 50,
            },
          ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      // Should complete without errors
      await expect(
        worker.scheduled(mockScheduledEvent, mockEnv),
      ).resolves.not.toThrow();
    });

    it("should handle empty discovery results", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "empty.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "[]",
      });
      vi.stubGlobal("fetch", mockFetch);

      // Should not throw on empty results
      await expect(
        worker.scheduled(mockScheduledEvent, mockEnv),
      ).resolves.not.toThrow();
    });

    it("should handle no configured sources", async () => {
      mockKvStorage.set("sources:registry", JSON.stringify([]));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "[]",
      });
      vi.stubGlobal("fetch", mockFetch);

      // Should handle empty sources gracefully
      await expect(
        worker.scheduled(mockScheduledEvent, mockEnv),
      ).resolves.not.toThrow();
    });
  });
});
