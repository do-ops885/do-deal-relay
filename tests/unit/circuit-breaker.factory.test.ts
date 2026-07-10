/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  createCircuitBreaker,
  callWithCircuitBreaker,
  getCircuitBreakerMetrics,
  resetCircuitBreaker,
  createGitHubCircuitBreaker,
  createTelegramCircuitBreaker,
  getSourceCircuitBreaker,
  clearSourceCircuitBreakers,
  getAllCircuitBreakerMetrics,
  resetAllMetrics,
  type CircuitState,
} from "../../worker/lib/circuit-breaker";
import type { Env } from "../../worker/types";

describe("Circuit Breaker", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockKvStorage = new Map();
    resetAllMetrics();
    clearSourceCircuitBreakers();
    vi.useFakeTimers();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockEnv = {
      DEALS_PROD: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(key);
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(key, JSON.parse(value));
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(key);
        }),
        list: vi.fn(async () => ({ keys: [], list_complete: true })),
      } as unknown as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {} as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      DEALS_DB: {} as any,
      TRUST_THRESHOLD: "0.3",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as unknown as Env;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  describe("Factory functions", () => {
    describe("createCircuitBreaker", () => {
      it("should create a circuit breaker with given name", () => {
        const cb = createCircuitBreaker("my-cb");

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });

      it("should pass options to circuit breaker", async () => {
        const cb = createCircuitBreaker("my-cb", {
          failureThreshold: 3,
          resetTimeoutMs: 10000,
        });

        // Test that options are used
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // 2 failures - still closed
        for (let i = 0; i < 2; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }
        expect(await cb.getState()).toBe("closed");

        // 3rd failure - opens
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }
        expect(await cb.getState()).toBe("open");
      });
    });

    describe("createGitHubCircuitBreaker", () => {
      it("should create circuit breaker for GitHub API", () => {
        const cb = createGitHubCircuitBreaker(mockEnv);

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });

      it("should use GitHub-specific configuration", async () => {
        const cb = createGitHubCircuitBreaker(mockEnv);

        // Should use failureThreshold: 5
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // 4 failures - still closed
        for (let i = 0; i < 4; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }
        expect(await cb.getState()).toBe("closed");

        // 5th failure - opens
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }
        expect(await cb.getState()).toBe("open");
      });

      it("should use 30 second reset timeout", async () => {
        const cb = createGitHubCircuitBreaker(mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open circuit
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }
        for (let i = 0; i < 4; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }

        vi.advanceTimersByTime(30000);

        // Should transition to half-open
        await cb.execute(vi.fn().mockResolvedValue("success"));
        expect(await cb.getState()).toBe("half-open");
      });
    });

    describe("createTelegramCircuitBreaker", () => {
      it("should create circuit breaker for Telegram", () => {
        const cb = createTelegramCircuitBreaker(mockEnv);

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });

      it("should use lower failure threshold for notifications", async () => {
        const cb = createTelegramCircuitBreaker(mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // 2 failures - still closed
        for (let i = 0; i < 2; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }
        expect(await cb.getState()).toBe("closed");

        // 3rd failure - opens (lower threshold)
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }
        expect(await cb.getState()).toBe("open");
      });

      it("should use 60 second reset timeout", async () => {
        const cb = createTelegramCircuitBreaker(mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open circuit
        for (let i = 0; i < 3; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }

        // Before 60 seconds - still open
        vi.advanceTimersByTime(59999);
        await expect(
          cb.execute(vi.fn().mockResolvedValue("success")),
        ).rejects.toThrow(CircuitBreakerOpenError);

        // At 60 seconds - transitions
        vi.advanceTimersByTime(1);
        await cb.execute(vi.fn().mockResolvedValue("success"));
        expect(await cb.getState()).toBe("half-open");
      });
    });

    describe("getSourceCircuitBreaker", () => {
      it("should create circuit breaker for domain", () => {
        const cb = getSourceCircuitBreaker("example.com", mockEnv);

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });

      it("should return same instance for same domain", () => {
        const cb1 = getSourceCircuitBreaker("example.com", mockEnv);
        const cb2 = getSourceCircuitBreaker("example.com", mockEnv);

        expect(cb1).toBe(cb2);
      });

      it("should return different instances for different domains", () => {
        const cb1 = getSourceCircuitBreaker("example.com", mockEnv);
        const cb2 = getSourceCircuitBreaker("other.com", mockEnv);

        expect(cb1).not.toBe(cb2);
      });

      it("should use 5 minute reset timeout for sources", async () => {
        const cb = getSourceCircuitBreaker("example.com", mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open circuit
        for (let i = 0; i < 5; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }

        // Before 5 minutes - still open
        vi.advanceTimersByTime(299999);
        await expect(
          cb.execute(vi.fn().mockResolvedValue("success")),
        ).rejects.toThrow(CircuitBreakerOpenError);

        // At 5 minutes - transitions
        vi.advanceTimersByTime(1);
        await cb.execute(vi.fn().mockResolvedValue("success"));
        expect(await cb.getState()).toBe("half-open");
      });

      it("should use source: prefix in name", async () => {
        // Clear any existing circuit breaker
        clearSourceCircuitBreakers();

        // Create a fresh circuit breaker with env
        const freshCb = getSourceCircuitBreaker("example.com", mockEnv);

        // Open the circuit to force a state save
        try {
          await freshCb.execute(
            vi.fn().mockRejectedValue(new Error("failure")),
          );
        } catch {
          // expected
        }
        // Need 5 failures for source circuit breaker
        for (let i = 0; i < 4; i++) {
          try {
            await freshCb.execute(
              vi.fn().mockRejectedValue(new Error("failure")),
            );
          } catch {
            // expected
          }
        }

        expect(mockEnv.DEALS_PROD.put).toHaveBeenCalledWith(
          "circuit:source:example.com",
          expect.any(String),
        );
      });
    });

    describe("clearSourceCircuitBreakers", () => {
      it("should clear all source circuit breakers", () => {
        const cb1 = getSourceCircuitBreaker("example.com", mockEnv);
        const cb2 = getSourceCircuitBreaker("other.com", mockEnv);

        clearSourceCircuitBreakers();

        const cb1Again = getSourceCircuitBreaker("example.com", mockEnv);
        const cb2Again = getSourceCircuitBreaker("other.com", mockEnv);

        expect(cb1).not.toBe(cb1Again);
        expect(cb2).not.toBe(cb2Again);
      });
    });
  });
});
