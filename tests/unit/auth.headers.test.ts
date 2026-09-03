import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import {
  verifyApiKey,
  authenticateRequest,
  getAllowedOrigin,
  createCorsHeaders,
  createSecurityHeaders,
} from "../../worker/lib/auth";
import type { Env } from "../../worker/types";

describe("Auth Headers", () => {
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
  // getAllowedOrigin()
  // ============================================================================

  describe("getAllowedOrigin()", () => {
    it("should return default origin for null input", () => {
      expect(getAllowedOrigin(null)).toBe("");
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
      expect(getAllowedOrigin("https://evil.com")).toBe("");
    });

    it("should return default for empty string", () => {
      expect(getAllowedOrigin("")).toBe("");
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
      expect(createCorsHeaders(request)["Access-Control-Allow-Origin"]).toBe(
        "https://do-deal-relay.com",
      );
    });

    it("should return default origin for disallowed origin", () => {
      const request = new Request("https://example.com", {
        headers: { Origin: "https://evil.com" },
      });
      expect(createCorsHeaders(request)["Access-Control-Allow-Origin"]).toBe(
        "",
      );
    });

    it("should allow correct HTTP methods", () => {
      const headers = createCorsHeaders(new Request("https://example.com"));
      expect(headers["Access-Control-Allow-Methods"]).toBe(
        "GET, POST, PUT, DELETE, OPTIONS",
      );
    });

    it("should allow correct headers", () => {
      const headers = createCorsHeaders(new Request("https://example.com"));
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
      const headers = createCorsHeaders(new Request("https://example.com"));
      expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    });

    it("should set max age to 86400 seconds", () => {
      const headers = createCorsHeaders(new Request("https://example.com"));
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
      expect(createSecurityHeaders()["X-Content-Type-Options"]).toBe("nosniff");
    });

    it("should deny framing", () => {
      expect(createSecurityHeaders()["X-Frame-Options"]).toBe("DENY");
    });

    it("should enable XSS filter", () => {
      expect(createSecurityHeaders()["X-XSS-Protection"]).toBe("1; mode=block");
    });

    it("should set strict referrer policy", () => {
      expect(createSecurityHeaders()["Referrer-Policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
    });

    it("should disable unnecessary permissions", () => {
      const permissions = createSecurityHeaders()["Permissions-Policy"];
      expect(permissions).toContain("accelerometer=()");
      expect(permissions).toContain("camera=()");
      expect(permissions).toContain("geolocation=()");
      expect(permissions).toContain("microphone=()");
      expect(permissions).toContain("payment=()");
    });

    it("should set HSTS with long max-age", () => {
      const hsts = createSecurityHeaders()["Strict-Transport-Security"];
      expect(hsts).toContain("max-age=63072000");
      expect(hsts).toContain("includeSubDomains");
      expect(hsts).toContain("preload");
    });

    it("should set restrictive CSP", () => {
      const csp = createSecurityHeaders()["Content-Security-Policy"];
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
      const result = await authenticateRequest(request, mockEnv);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Invalid API key");
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
        headers: { "X-API-Key": "ddr_abc!@#$%^&*()_+123_1705310400" },
      });
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
        headers: { Authorization: `Bearer ${longKey}` },
      });
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
      const unicodeKey = "ddr_" + encodeURIComponent("日本語") + "_1234567890";
      const request = new Request("https://example.com", {
        headers: { Authorization: `Bearer ${unicodeKey}` },
      });
      const result = await authenticateRequest(request, mockEnv);
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // NOTE: Functions Not Currently Implemented
  // ============================================================================

  describe("Unimplemented Functions (Noted for Future)", () => {
    it("NOTE: checkRateLimit() - not currently in auth.ts", () => {
      expect(true).toBe(true);
    });

    it("NOTE: updateRateLimitUsage() - not currently in auth.ts", () => {
      expect(true).toBe(true);
    });

    it("NOTE: refreshApiKey() - not currently in auth.ts", () => {
      expect(true).toBe(true);
    });

    it("NOTE: revokeApiKey() - not currently in auth.ts", () => {
      expect(true).toBe(true);
    });
  });
});
