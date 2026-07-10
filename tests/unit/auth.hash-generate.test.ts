import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { hashApiKey, generateApiKey } from "../../worker/lib/auth";
import type { Env } from "../../worker/types";

// ============================================================================
// Test Setup & Mocks
// ============================================================================

describe("Auth", () => {
  // Mock KV namespace
  const mockGet = vi.fn();
  const mockPut = vi.fn();
  const mockList = vi.fn();

  const mockEnv = {
    DEALS_SOURCES: {
      get: mockGet,
      put: mockPut,
      list: mockList,
    },
    DEALS_PROD: {
      get: mockGet,
      put: mockPut,
      list: mockList,
    },
    DEALS_LOG: {
      get: mockGet,
      put: mockPut,
      list: mockList,
    },
    DEALS_LOCK: {
      get: mockGet,
      put: mockPut,
      list: mockList,
    },
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    DEALS_DB: {} as any,
    TRUST_THRESHOLD: "0.3",
  } as unknown as Env;

  // Mock crypto.subtle for deterministic testing
  const originalCrypto = global.crypto;
  let mockCryptoSubtle: {
    digest: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

    // Setup deterministic crypto.subtle mock
    mockCryptoSubtle = {
      digest: vi
        .fn()
        .mockImplementation((algorithm: string, data: ArrayBuffer) => {
          // Return a deterministic hash based on input data
          const view = new Uint8Array(data);
          const hash = new Uint8Array(32);
          for (let i = 0; i < 32; i++) {
            hash[i] = (view[i % view.length]! + i) % 256;
          }
          return Promise.resolve(hash.buffer);
        }),
    };

    // Mock crypto.getRandomValues for deterministic key generation
    const mockGetRandomValues = vi
      .fn()
      .mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = (i * 17) % 256;
        }
        return arr;
      });

    Object.defineProperty(global, "crypto", {
      value: {
        subtle: mockCryptoSubtle,
        getRandomValues: mockGetRandomValues,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(global, "crypto", {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });

  // ============================================================================
  // hashApiKey()
  // ============================================================================

  describe("hashApiKey()", () => {
    it("should produce SHA-256 hash of input string", async () => {
      const key = "test-api-key";
      const hash = await hashApiKey(key);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex chars
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should be deterministic - same input produces same hash", async () => {
      const key = "test-api-key";
      const hash1 = await hashApiKey(key);
      const hash2 = await hashApiKey(key);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", async () => {
      const hash1 = await hashApiKey("key-one");
      const hash2 = await hashApiKey("key-two");

      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty string", async () => {
      const hash = await hashApiKey("");

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it("should handle long strings", async () => {
      const longKey = "a".repeat(1000);
      const hash = await hashApiKey(longKey);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it("should handle special characters", async () => {
      const key = "ddr_abc123!@#$%^&*()_+";
      const hash = await hashApiKey(key);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });
  });

  // ============================================================================
  // generateApiKey()
  // ============================================================================

  describe("generateApiKey()", () => {
    it("should generate key with correct format (ddr_<random>_<timestamp>)", () => {
      const key = generateApiKey();

      expect(key).toMatch(/^ddr_[a-f0-9]{32}_\d+$/);
    });

    it("should generate unique keys on each call", () => {
      // Reset mock to return different values for each call
      const mockGetRandomValues = vi
        .fn()
        .mockImplementation((arr: Uint8Array) => {
          const callCount = mockGetRandomValues.mock.calls.length;
          for (let i = 0; i < arr.length; i++) {
            arr[i] = ((i + callCount) * 17) % 256;
          }
          return arr;
        });

      Object.defineProperty(global.crypto, "getRandomValues", {
        value: mockGetRandomValues,
        writable: true,
        configurable: true,
      });

      const key1 = generateApiKey();
      vi.advanceTimersByTime(1000); // Advance time to get different timestamp
      const key2 = generateApiKey();

      expect(key1).not.toBe(key2);
    });

    it("should include timestamp component", () => {
      const key = generateApiKey();
      const parts = key.split("_");

      expect(parts.length).toBe(3);
      expect(parts[0]).toBe("ddr");
      expect(parts[1]!.length).toBe(32);
      expect(parts[2]).toMatch(/^\d+$/);

      const timestamp = parseInt(parts[2]!, 10);
      const expectedTimestamp = Math.floor(Date.now() / 1000);
      expect(timestamp).toBe(expectedTimestamp);
    });

    it("should generate 32-character random hex component", () => {
      const key = generateApiKey();
      const parts = key.split("_");

      expect(parts[1]).toMatch(/^[a-f0-9]{32}$/);
    });
  });
});
