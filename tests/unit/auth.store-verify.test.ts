import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import {
  listApiKeys,
  storeApiKey,
  verifyApiKey,
  type ApiKeyConfig,
} from "../../worker/lib/auth";
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
  // storeApiKey()
  // ============================================================================

  describe("storeApiKey()", () => {
    const baseConfig: Omit<ApiKeyConfig, "key"> = {
      userId: "user-123",
      role: "user",
      createdAt: new Date().toISOString(),
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
      },
    };

    it("should generate and store API key with metadata", async () => {
      mockPut.mockResolvedValue(undefined);

      const key = await storeApiKey(mockEnv, {
        ...baseConfig,
        key: "",
      });

      expect(key).toMatch(/^ddr_[a-f0-9]{32}_\d+$/);
      expect(mockPut).toHaveBeenCalledOnce();

      const [storedKey, storedValue, options] = mockPut.mock.calls[0]!;
      expect(storedKey).toMatch(/^apikey:[a-f0-9]{64}$/);

      const metadata = JSON.parse(storedValue as string);
      expect(metadata.userId).toBe("user-123");
      expect(metadata.role).toBe("user");
      expect(metadata.keyHash).toBeDefined();
      expect(metadata.keyHash.length).toBe(64);
    });

    it("should store key hash, not plaintext", async () => {
      mockPut.mockResolvedValue(undefined);

      const key = await storeApiKey(mockEnv, {
        ...baseConfig,
        key: "",
      });

      const [, storedValue] = mockPut.mock.calls[0]!;
      const metadata = JSON.parse(storedValue as string);

      // The plaintext key should not be anywhere in the stored data
      expect(storedValue).not.toContain(key);
      // The 'key' field from config should be stored (empty string) but not the generated key
      expect(metadata.key).toBe("");
      expect(metadata.keyHash).toBeDefined();
      expect(metadata.keyHash.length).toBe(64);
    });

    it("should set default TTL of 1 year when no expiration", async () => {
      mockPut.mockResolvedValue(undefined);

      await storeApiKey(mockEnv, {
        ...baseConfig,
        key: "",
      });

      const [, , options] = mockPut.mock.calls[0]!;
      expect(options).toEqual({ expirationTtl: 365 * 86400 });
    });

    it("should set expiration timestamp when expiresAt is provided", async () => {
      mockPut.mockResolvedValue(undefined);
      const futureDate = new Date(Date.now() + 86400000);

      await storeApiKey(mockEnv, {
        ...baseConfig,
        key: "",
        expiresAt: futureDate.toISOString(),
      });

      const [, , options] = mockPut.mock.calls[0]!;
      const expectedExpiration = Math.floor(futureDate.getTime() / 1000);
      expect(options).toEqual({
        expiration: expectedExpiration,
        expirationTtl: undefined,
      });
    });

    it("should fall back to default TTL when expiresAt is in the past", async () => {
      mockPut.mockResolvedValue(undefined);
      const pastDate = new Date(Date.now() - 86400000);

      await storeApiKey(mockEnv, {
        ...baseConfig,
        key: "",
        expiresAt: pastDate.toISOString(),
      });

      const [, , options] = mockPut.mock.calls[0]!;
      // A past expiration must never reach KV as a past timestamp (wrangler
      // would reject it with a 500); the 1-year default TTL applies instead.
      expect(options).toEqual({ expirationTtl: 365 * 86400 });
    });

    it("should preserve all metadata fields", async () => {
      mockPut.mockResolvedValue(undefined);

      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      await storeApiKey(mockEnv, {
        ...baseConfig,
        key: "",
        expiresAt,
      });

      const [, storedValue] = mockPut.mock.calls[0]!;
      const metadata = JSON.parse(storedValue as string);

      expect(metadata.userId).toBe("user-123");
      expect(metadata.role).toBe("user");
      expect(metadata.createdAt).toBe(baseConfig.createdAt);
      expect(metadata.expiresAt).toBe(expiresAt);
      expect(metadata.rateLimit).toEqual({
        requestsPerMinute: 60,
        requestsPerHour: 1000,
      });
    });

    it("should support different roles", async () => {
      mockPut.mockResolvedValue(undefined);

      const roles: Array<"admin" | "user" | "readonly"> = [
        "admin",
        "user",
        "readonly",
      ];

      for (const role of roles) {
        mockPut.mockClear();
        await storeApiKey(mockEnv, {
          ...baseConfig,
          key: "",
          role,
        });

        const [, storedValue] = mockPut.mock.calls[0]!;
        const metadata = JSON.parse(storedValue as string);
        expect(metadata.role).toBe(role);
      }
    });
  });

  // ============================================================================
  // listApiKeys()
  // ============================================================================

  describe("listApiKeys()", () => {
    // biome-ignore lint/correctness/useQwikValidLexicalScope: Qwik-specific rule; not a Qwik codebase
    const makeMetadata = (
      overrides: Partial<ApiKeyConfig> = {},
    ): ApiKeyConfig => ({
      key: "",
      userId: "user-123",
      role: "user",
      createdAt: new Date().toISOString(),
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
      },
      ...overrides,
    });

    it("should return keyHash from metadata when present", async () => {
      mockList.mockResolvedValue({
        keys: [{ name: "apikey:test-key-hash-0001" }],
      });
      mockGet.mockResolvedValue(
        makeMetadata({ keyHash: "abcdef1234567890abcdef1234567890" }),
      );

      const keys = await listApiKeys(mockEnv);

      expect(keys).toHaveLength(1);
      expect(keys[0]?.keyHash).toBe("abcdef1234567890abcdef1234567890");
      expect(mockList).toHaveBeenCalledWith({ prefix: "apikey:" });
    });

    it("should derive keyHash from the KV key name when metadata lacks it", async () => {
      // Mirrors keys seeded directly into KV by tests/e2e/setup-auth.sh,
      // whose metadata has no keyHash field.
      const seededHash =
        "8440f560ecef5acc8a755f55176b2847008907591fab695d3d2e0fd0255502fe";
      mockList.mockResolvedValue({
        keys: [{ name: `apikey:${seededHash}` }],
      });
      mockGet.mockResolvedValue(makeMetadata());

      const keys = await listApiKeys(mockEnv);

      expect(keys).toHaveLength(1);
      expect(keys[0]?.keyHash).toBe(seededHash);
    });

    it("should filter out KV entries without metadata", async () => {
      mockList.mockResolvedValue({
        keys: [
          { name: "apikey:test-hash-aaaa1111" },
          { name: "apikey:test-hash-bbbb2222" },
        ],
      });
      mockGet.mockImplementation((name: string) =>
        name.includes("aaaa")
          ? Promise.resolve(null)
          : Promise.resolve(makeMetadata({ keyHash: name.slice(7) })),
      );

      const keys = await listApiKeys(mockEnv);

      expect(keys).toHaveLength(1);
      expect(keys[0]?.keyHash).toBe("test-hash-bbbb2222");
    });
  });

  // ============================================================================
  // verifyApiKey()
  // ============================================================================

  describe("verifyApiKey()", () => {
    const validApiKey = "ddr_testkey1234567890123456789012_1705310400";
    const validKeyHash = "testhash123456789012345678901234567890"; // fake hash

    const createMockMetadata = (
      overrides: Partial<ApiKeyConfig> = {},
    ): ApiKeyConfig => ({
      key: "",
      userId: "user-123",
      role: "user",
      createdAt: new Date().toISOString(),
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
      },
      ...overrides,
    });

    beforeEach(() => {
      // Mock the hash function to return predictable hash
      mockCryptoSubtle.digest.mockImplementation(() => {
        const hash = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          hash[i] = i + 1;
        }
        return Promise.resolve(hash.buffer);
      });
    });

    it("should validate correct API key", async () => {
      mockGet.mockResolvedValue(createMockMetadata());

      const result = await verifyApiKey(mockEnv, validApiKey);

      expect(result.authenticated).toBe(true);
      expect(result.userId).toBe("user-123");
      expect(result.role).toBe("user");
      expect(result.error).toBeUndefined();
    });

    it("should reject invalid format (missing ddr_ prefix)", async () => {
      const invalidKey = "invalid_key_format";

      const result = await verifyApiKey(mockEnv, invalidKey);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Invalid API key format");
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("should reject non-existent API key", async () => {
      mockGet.mockResolvedValue(null);

      const result = await verifyApiKey(mockEnv, validApiKey);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Invalid API key");
    });

    it("should reject expired API key", async () => {
      const expiredMetadata = createMockMetadata({
        expiresAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
      });
      mockGet.mockResolvedValue(expiredMetadata);

      const result = await verifyApiKey(mockEnv, validApiKey);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("API key expired");
    });

    it("should accept non-expired API key", async () => {
      const validMetadata = createMockMetadata({
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      });
      mockGet.mockResolvedValue(validMetadata);

      const result = await verifyApiKey(mockEnv, validApiKey);

      expect(result.authenticated).toBe(true);
    });

    it("should accept API key without expiration", async () => {
      const validMetadata = createMockMetadata();
      delete validMetadata.expiresAt;
      mockGet.mockResolvedValue(validMetadata);

      const result = await verifyApiKey(mockEnv, validApiKey);

      expect(result.authenticated).toBe(true);
    });

    it("should update lastUsed timestamp on successful validation", async () => {
      const metadata = createMockMetadata({ lastUsed: "2024-01-01T00:00:00Z" });
      mockGet.mockResolvedValue(metadata);
      mockPut.mockResolvedValue(undefined);

      await verifyApiKey(mockEnv, validApiKey);

      expect(mockPut).toHaveBeenCalledOnce();
      const [key, value] = mockPut.mock.calls[0]!;
      expect(key).toMatch(/^apikey:/);

      const updatedMetadata = JSON.parse(value as string);
      expect(updatedMetadata.lastUsed).toBe("2024-01-15T12:00:00.000Z");
    });

    it("should return correct role in result", async () => {
      const roles: Array<"admin" | "user" | "readonly"> = [
        "admin",
        "user",
        "readonly",
      ];

      for (const role of roles) {
        mockGet.mockResolvedValue(createMockMetadata({ role }));
        mockPut.mockResolvedValue(undefined);

        const result = await verifyApiKey(mockEnv, validApiKey);

        expect(result.authenticated).toBe(true);
        expect(result.role).toBe(role);
      }
    });

    it("should return correct userId in result", async () => {
      mockGet.mockResolvedValue(
        createMockMetadata({ userId: "custom-user-456" }),
      );

      const result = await verifyApiKey(mockEnv, validApiKey);

      expect(result.userId).toBe("custom-user-456");
    });

    it("should look up key by hash", async () => {
      mockGet.mockResolvedValue(createMockMetadata());

      await verifyApiKey(mockEnv, validApiKey);

      expect(mockGet).toHaveBeenCalledOnce();
      const [key] = mockGet.mock.calls[0]!;
      expect(key).toMatch(/^apikey:[a-f0-9]{64}$/);
    });
  });
});
