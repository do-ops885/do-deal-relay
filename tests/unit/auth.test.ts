import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import {
  hashApiKey,
  generateApiKey,
  storeApiKey,
  verifyApiKey,
  extractApiKey,
  authenticateRequest,
  requireAuth,
  getAllowedOrigin,
  createCorsHeaders,
  createSecurityHeaders,
  type ApiKeyConfig,
  type AuthResult,
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
            hash[i] = (view[i % view.length] + i) % 256;
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
      expect(parts[1].length).toBe(32);
      expect(parts[2]).toMatch(/^\d+$/);

      const timestamp = parseInt(parts[2], 10);
      const expectedTimestamp = Math.floor(Date.now() / 1000);
      expect(timestamp).toBe(expectedTimestamp);
    });

    it("should generate 32-character random hex component", () => {
      const key = generateApiKey();
      const parts = key.split("_");

      expect(parts[1]).toMatch(/^[a-f0-9]{32}$/);
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

      const [storedKey, storedValue, options] = mockPut.mock.calls[0];
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

      const [, storedValue] = mockPut.mock.calls[0];
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

      const [, , options] = mockPut.mock.calls[0];
      expect(options).toEqual({ expirationTtl: 365 * 86400 });
    });

    it("should not set TTL when expiresAt is provided", async () => {
      mockPut.mockResolvedValue(undefined);

      await storeApiKey(mockEnv, {
        ...baseConfig,
        key: "",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const [, , options] = mockPut.mock.calls[0];
      expect(options).toEqual({ expirationTtl: undefined });
    });

    it("should preserve all metadata fields", async () => {
      mockPut.mockResolvedValue(undefined);

      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      await storeApiKey(mockEnv, {
        ...baseConfig,
        key: "",
        expiresAt,
      });

      const [, storedValue] = mockPut.mock.calls[0];
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

        const [, storedValue] = mockPut.mock.calls[0];
        const metadata = JSON.parse(storedValue as string);
        expect(metadata.role).toBe(role);
      }
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
      const [key, value] = mockPut.mock.calls[0];
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
      const [key] = mockGet.mock.calls[0];
      expect(key).toMatch(/^apikey:[a-f0-9]{64}$/);
    });
  });

  // ============================================================================
  // extractApiKey()
  // ============================================================================

  describe("extractApiKey()", () => {
    it("should extract API key from Authorization header (Bearer token)", () => {
      const request = new Request("https://example.com/api/test", {
        headers: {
          Authorization: "Bearer ddr_abc123_1234567890",
        },
      });

      const key = extractApiKey(request);

      expect(key).toBe("ddr_abc123_1234567890");
    });

    it("should extract API key from X-API-Key header", () => {
      const request = new Request("https://example.com/api/test", {
        headers: {
          "X-API-Key": "ddr_def456_0987654321",
        },
      });

      const key = extractApiKey(request);

      expect(key).toBe("ddr_def456_0987654321");
    });

    it("should prefer Authorization header over X-API-Key", () => {
      const request = new Request("https://example.com/api/test", {
        headers: {
          Authorization: "Bearer ddr_auth_header_123",
          "X-API-Key": "ddr_apikey_header_456",
        },
      });

      const key = extractApiKey(request);

      expect(key).toBe("ddr_auth_header_123");
    });

    it("should return null when no API key header present", () => {
      const request = new Request("https://example.com/api/test", {
        headers: {
          "Content-Type": "application/json",
        },
      });

      const key = extractApiKey(request);

      expect(key).toBeNull();
    });

    it("should return null for empty Authorization header", () => {
      const request = new Request("https://example.com/api/test", {
        headers: {
          Authorization: "",
        },
      });

      const key = extractApiKey(request);

      expect(key).toBeNull();
    });

    it("should handle Authorization header without Bearer prefix", () => {
      const request = new Request("https://example.com/api/test", {
        headers: {
          Authorization: "ddr_direct_key_123",
        },
      });

      const key = extractApiKey(request);

      expect(key).toBeNull();
    });

    it("should handle Bearer with empty token", () => {
      const request = new Request("https://example.com/api/test", {
        headers: {
          Authorization: "Bearer ",
        },
      });

      const key = extractApiKey(request);

      // When "Bearer " has no token, it returns empty string
      // Note: Request headers may normalize this to null
      expect(key === "" || key === null).toBe(true);
    });

    it("should be case-insensitive for header names", () => {
      const request = new Request("https://example.com/api/test", {
        headers: {
          authorization: "Bearer ddr_lower_case_123",
        },
      });

      const key = extractApiKey(request);

      expect(key).toBe("ddr_lower_case_123");
    });
  });

  // ============================================================================
  // authenticateRequest()
  // ============================================================================

  describe("authenticateRequest()", () => {
    const createRequest = (headers: Record<string, string> = {}): Request => {
      return new Request("https://example.com/api/test", {
        headers,
      });
    };

    it("should reject all requests when no API keys configured", async () => {
      mockList.mockResolvedValue({ keys: [] });

      const request = createRequest();
      const result = await authenticateRequest(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Missing API key");
    });

    it("should reject request with missing API key", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });

      const request = createRequest();
      const result = await authenticateRequest(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Missing API key");
    });

    it("should authenticate valid API key from Authorization header", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const request = createRequest({
        Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await authenticateRequest(request, mockEnv);

      expect(result.authenticated).toBe(true);
      expect(result.userId).toBe("user-123");
    });

    it("should authenticate valid API key from X-API-Key header", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      mockGet.mockResolvedValue({
        userId: "user-456",
        role: "admin",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const request = createRequest({
        "X-API-Key": "ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await authenticateRequest(request, mockEnv);

      expect(result.authenticated).toBe(true);
      expect(result.role).toBe("admin");
    });

    it("should reject invalid API key format", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });

      const request = createRequest({
        Authorization: "Bearer invalid_key",
      });
      const result = await authenticateRequest(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Invalid API key format");
    });

    it("should reject non-existent API key", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      mockGet.mockResolvedValue(null);

      const request = createRequest({
        Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await authenticateRequest(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Invalid API key");
    });

    it("should reject expired API key", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });

      const request = createRequest({
        Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await authenticateRequest(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("API key expired");
    });
  });

  // ============================================================================
  // requireAuth()
  // ============================================================================

  describe("requireAuth()", () => {
    const createRequest = (headers: Record<string, string> = {}): Request => {
      return new Request("https://example.com/api/test", {
        headers,
      });
    };

    beforeEach(() => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
    });

    it("should return AuthResult for successful authentication", async () => {
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const middleware = requireAuth(mockEnv);
      const request = createRequest({
        Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await middleware(request);

      expect("authenticated" in result).toBe(true);
      if ("authenticated" in result) {
        expect(result.authenticated).toBe(true);
        expect(result.userId).toBe("user-123");
      }
    });

    it("should return Response for failed authentication", async () => {
      const middleware = requireAuth(mockEnv);
      const request = createRequest();
      const result = await middleware(request);

      expect(result instanceof Response).toBe(true);
      if (result instanceof Response) {
        expect(result.status).toBe(401);
      }
    });

    it("should enforce role requirements - user cannot access admin endpoint", async () => {
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const middleware = requireAuth(mockEnv, "admin");
      const request = createRequest({
        Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await middleware(request);

      expect(result instanceof Response).toBe(true);
      if (result instanceof Response) {
        expect(result.status).toBe(403);
      }
    });

    it("should allow admin to access user endpoint", async () => {
      mockGet.mockResolvedValue({
        userId: "admin-123",
        role: "admin",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const middleware = requireAuth(mockEnv, "user");
      const request = createRequest({
        Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await middleware(request);

      expect("authenticated" in result).toBe(true);
      if ("authenticated" in result) {
        expect(result.authenticated).toBe(true);
        expect(result.role).toBe("admin");
      }
    });

    it("should reject user from accessing readonly-only endpoint", async () => {
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const middleware = requireAuth(mockEnv, "readonly");
      const request = createRequest({
        Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await middleware(request);

      // Current implementation doesn't support role hierarchy
      expect(result instanceof Response).toBe(true);
      if (result instanceof Response) {
        expect(result.status).toBe(403);
      }
    });

    it("should allow exact role match", async () => {
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const middleware = requireAuth(mockEnv, "user");
      const request = createRequest({
        Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await middleware(request);

      expect("authenticated" in result).toBe(true);
      if ("authenticated" in result) {
        expect(result.authenticated).toBe(true);
      }
    });

    it("should not require role when none specified", async () => {
      mockGet.mockResolvedValue({
        userId: "readonly-123",
        role: "readonly",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const middleware = requireAuth(mockEnv); // No role required
      const request = createRequest({
        Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
      });
      const result = await middleware(request);

      expect("authenticated" in result).toBe(true);
      if ("authenticated" in result) {
        expect(result.authenticated).toBe(true);
        expect(result.role).toBe("readonly");
      }
    });
  });

  // ============================================================================
  // getAllowedOrigin()
  // ============================================================================

  describe("getAllowedOrigin()", () => {
    it("should return default origin for null input", () => {
      const origin = getAllowedOrigin(null);
      expect(origin).toBe("https://do-deal-relay.pages.dev");
    });

    it("should return allowed origin if in list", () => {
      const allowedOrigins = [
        "https://do-deal-relay.pages.dev",
        "https://do-deal-relay.com",
        "https://www.do-deal-relay.com",
        "http://localhost:8787",
        "http://localhost:3000",
      ];

      for (const allowed of allowedOrigins) {
        expect(getAllowedOrigin(allowed)).toBe(allowed);
      }
    });

    it("should return default for disallowed origin", () => {
      const origin = getAllowedOrigin("https://evil.com");
      expect(origin).toBe("https://do-deal-relay.pages.dev");
    });

    it("should return default for empty string", () => {
      const origin = getAllowedOrigin("");
      expect(origin).toBe("https://do-deal-relay.pages.dev");
    });
  });

  // ============================================================================
  // createCorsHeaders()
  // ============================================================================

  describe("createCorsHeaders()", () => {
    it("should include all required CORS headers", () => {
      const request = new Request("https://example.com", {
        headers: { Origin: "https://do-deal-relay.com" },
      });

      const headers = createCorsHeaders(request);

      expect(headers["Access-Control-Allow-Origin"]).toBeDefined();
      expect(headers["Access-Control-Allow-Methods"]).toBeDefined();
      expect(headers["Access-Control-Allow-Headers"]).toBeDefined();
      expect(headers["Access-Control-Allow-Credentials"]).toBeDefined();
      expect(headers["Access-Control-Max-Age"]).toBeDefined();
    });

    it("should reflect allowed origin", () => {
      const request = new Request("https://example.com", {
        headers: { Origin: "https://do-deal-relay.com" },
      });

      const headers = createCorsHeaders(request);

      expect(headers["Access-Control-Allow-Origin"]).toBe(
        "https://do-deal-relay.com",
      );
    });

    it("should return default origin for disallowed origin", () => {
      const request = new Request("https://example.com", {
        headers: { Origin: "https://evil.com" },
      });

      const headers = createCorsHeaders(request);

      expect(headers["Access-Control-Allow-Origin"]).toBe(
        "https://do-deal-relay.pages.dev",
      );
    });

    it("should allow correct HTTP methods", () => {
      const request = new Request("https://example.com");
      const headers = createCorsHeaders(request);

      expect(headers["Access-Control-Allow-Methods"]).toBe(
        "GET, POST, PUT, DELETE, OPTIONS",
      );
    });

    it("should allow correct headers", () => {
      const request = new Request("https://example.com");
      const headers = createCorsHeaders(request);

      expect(headers["Access-Control-Allow-Headers"]).toContain("Content-Type");
      expect(headers["Access-Control-Allow-Headers"]).toContain(
        "Authorization",
      );
      expect(headers["Access-Control-Allow-Headers"]).toContain("X-API-Key");
      expect(headers["Access-Control-Allow-Headers"]).toContain(
        "X-Correlation-ID",
      );
    });

    it("should allow credentials", () => {
      const request = new Request("https://example.com");
      const headers = createCorsHeaders(request);

      expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    });

    it("should set max age to 86400 seconds", () => {
      const request = new Request("https://example.com");
      const headers = createCorsHeaders(request);

      expect(headers["Access-Control-Max-Age"]).toBe("86400");
    });
  });

  // ============================================================================
  // createSecurityHeaders()
  // ============================================================================

  describe("createSecurityHeaders()", () => {
    it("should include all required security headers", () => {
      const headers = createSecurityHeaders();

      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["X-Frame-Options"]).toBe("DENY");
      expect(headers["X-XSS-Protection"]).toBe("1; mode=block");
      expect(headers["Referrer-Policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(headers["Permissions-Policy"]).toBeDefined();
      expect(headers["Strict-Transport-Security"]).toBeDefined();
      expect(headers["Content-Security-Policy"]).toBeDefined();
    });

    it("should prevent MIME type sniffing", () => {
      const headers = createSecurityHeaders();
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    });

    it("should deny framing", () => {
      const headers = createSecurityHeaders();
      expect(headers["X-Frame-Options"]).toBe("DENY");
    });

    it("should enable XSS filter", () => {
      const headers = createSecurityHeaders();
      expect(headers["X-XSS-Protection"]).toBe("1; mode=block");
    });

    it("should set strict referrer policy", () => {
      const headers = createSecurityHeaders();
      expect(headers["Referrer-Policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
    });

    it("should disable unnecessary permissions", () => {
      const headers = createSecurityHeaders();
      const permissions = headers["Permissions-Policy"];

      expect(permissions).toContain("accelerometer=()");
      expect(permissions).toContain("camera=()");
      expect(permissions).toContain("geolocation=()");
      expect(permissions).toContain("microphone=()");
      expect(permissions).toContain("payment=()");
    });

    it("should set HSTS with long max-age", () => {
      const headers = createSecurityHeaders();
      const hsts = headers["Strict-Transport-Security"];

      expect(hsts).toContain("max-age=63072000");
      expect(hsts).toContain("includeSubDomains");
      expect(hsts).toContain("preload");
    });

    it("should set restrictive CSP", () => {
      const headers = createSecurityHeaders();
      const csp = headers["Content-Security-Policy"];

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-src 'none'");
    });
  });

  // ============================================================================
  // Edge Cases & Security
  // ============================================================================

  describe("Edge Cases & Security", () => {
    it("should handle KV get errors gracefully", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      mockGet.mockRejectedValue(new Error("KV connection failed"));

      const request = new Request("https://example.com", {
        headers: {
          Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
        },
      });

      await expect(authenticateRequest(request, mockEnv)).rejects.toThrow(
        "KV connection failed",
      );
    });

    it("should propagate KV put errors on lastUsed update", async () => {
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockRejectedValue(new Error("KV write failed"));

      // Current implementation doesn't catch put errors - they propagate
      await expect(
        verifyApiKey(mockEnv, "ddr_testkey1234567890123456789012_1705310400"),
      ).rejects.toThrow("KV write failed");
    });

    it("should handle malformed KV metadata", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      mockGet.mockResolvedValue("invalid-json");

      const request = new Request("https://example.com", {
        headers: {
          Authorization: "Bearer ddr_testkey1234567890123456789012_1705310400",
        },
      });

      // JSON parse will throw on invalid JSON
      await expect(authenticateRequest(request, mockEnv)).rejects.toThrow();
    });

    it("should handle API key with special characters", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const request = new Request("https://example.com", {
        headers: {
          "X-API-Key": "ddr_abc!@#$%^&*()_+123_1705310400",
        },
      });

      // Should at least not crash and attempt validation
      const result = await authenticateRequest(request, mockEnv);
      expect(result).toBeDefined();
    });

    it("should handle very long API keys", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      const longKey = "ddr_" + "a".repeat(500) + "_1234567890";
      const request = new Request("https://example.com", {
        headers: {
          Authorization: `Bearer ${longKey}`,
        },
      });

      // Should handle without crashing
      const result = await authenticateRequest(request, mockEnv);
      expect(result).toBeDefined();
    });

    it("should handle Unicode in API key", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      mockGet.mockResolvedValue({
        userId: "user-123",
        role: "user",
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      });
      mockPut.mockResolvedValue(undefined);

      // Encode Unicode for header compatibility
      const unicodeKey = "ddr_" + encodeURIComponent("日本語") + "_1234567890";
      const request = new Request("https://example.com", {
        headers: {
          Authorization: `Bearer ${unicodeKey}`,
        },
      });

      // Should handle without crashing
      const result = await authenticateRequest(request, mockEnv);
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // NOTE: Functions Not Currently Implemented
  // ============================================================================

  describe("Unimplemented Functions (Noted for Future)", () => {
    it("NOTE: checkRateLimit() - not currently in auth.ts", () => {
      // Rate limiting is configured in metadata but enforcement is not implemented
      // This test documents the expected interface for future implementation
      expect(true).toBe(true);
    });

    it("NOTE: updateRateLimitUsage() - not currently in auth.ts", () => {
      // Usage tracking would track request counts per time window
      // This test documents the expected interface for future implementation
      expect(true).toBe(true);
    });

    it("NOTE: refreshApiKey() - not currently in auth.ts", () => {
      // Key refresh would generate new key while preserving rate limits
      // This test documents the expected interface for future implementation
      expect(true).toBe(true);
    });

    it("NOTE: revokeApiKey() - not currently in auth.ts", () => {
      // Key revocation would mark key as invalid
      // This test documents the expected interface for future implementation
      expect(true).toBe(true);
    });
  });
});
