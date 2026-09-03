import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { authenticateRequest, requireAuth } from "../../worker/lib/auth";
import type { Env } from "../../worker/types";

describe("Auth Security", () => {
  const mockGet = vi.fn();
  const mockPut = vi.fn();
  const mockList = vi.fn();

  const mockEnv = {
    DEALS_SOURCES: { get: mockGet, put: mockPut, list: mockList },
    DEALS_PROD: { get: mockGet, put: mockPut, list: mockList },
    DEALS_LOG: { get: mockGet, put: mockPut, list: mockList },
    DEALS_LOCK: { get: mockGet, put: mockPut, list: mockList },
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    DEALS_DB: {} as any,
    TRUST_THRESHOLD: "0.3",
  } as unknown as Env;

  const originalCrypto = global.crypto;
  let mockCryptoSubtle: { digest: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

    mockCryptoSubtle = {
      digest: vi
        .fn()
        .mockImplementation((_algorithm: string, data: ArrayBuffer) => {
          const view = new Uint8Array(data);
          const hash = new Uint8Array(32);
          for (let i = 0; i < 32; i++) {
            hash[i] = (view[i % view.length]! + i) % 256;
          }
          return Promise.resolve(hash.buffer);
        }),
    };

    const mockGetRandomValues = vi
      .fn()
      .mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = (i * 17) % 256;
        }
        return arr;
      });

    Object.defineProperty(global, "crypto", {
      value: { subtle: mockCryptoSubtle, getRandomValues: mockGetRandomValues },
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
  // authenticateRequest()
  // ============================================================================

  describe("authenticateRequest()", () => {
    const createRequest = (headers: Record<string, string> = {}): Request => {
      return new Request("https://example.com/api/test", { headers });
    };

    it("should reject all requests when no API keys configured", async () => {
      mockList.mockResolvedValue({ keys: [] });
      const result = await authenticateRequest(createRequest(), mockEnv);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Missing API key");
    });

    it("should reject request with missing API key", async () => {
      mockList.mockResolvedValue({ keys: [{ name: "apikey:existing" }] });
      const result = await authenticateRequest(createRequest(), mockEnv);
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
      const request = createRequest({ Authorization: "Bearer invalid_key" });
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
      return new Request("https://example.com/api/test", { headers });
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
      const result = await middleware(createRequest());
      expect(result instanceof Response).toBe(true);
      if (result instanceof Response) expect(result.status).toBe(401);
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
      if (result instanceof Response) expect(result.status).toBe(403);
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
      expect(result instanceof Response).toBe(true);
      if (result instanceof Response) expect(result.status).toBe(403);
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
      if ("authenticated" in result) expect(result.authenticated).toBe(true);
    });

    it("should not require role when none specified", async () => {
      mockGet.mockResolvedValue({
        userId: "readonly-123",
        role: "readonly",
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
        expect(result.role).toBe("readonly");
      }
    });
  });
});
