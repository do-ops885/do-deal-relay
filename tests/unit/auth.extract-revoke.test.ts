import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { extractApiKey } from "../../worker/lib/auth";
import type { Env } from "../../worker/types";

describe("Auth", () => {
  const originalCrypto = global.crypto;
  let mockCryptoSubtle: { digest: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

    mockCryptoSubtle = {
      digest: vi
        .fn()
        .mockImplementation((algorithm: string, data: ArrayBuffer) => {
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

  describe("extractApiKey()", () => {
    it("should extract API key from Authorization header (Bearer token)", () => {
      const request = new Request("https://example.com/api/test", {
        headers: { Authorization: "Bearer ddr_abc123_1234567890" },
      });
      expect(extractApiKey(request)).toBe("ddr_abc123_1234567890");
    });

    it("should extract API key from X-API-Key header", () => {
      const request = new Request("https://example.com/api/test", {
        headers: { "X-API-Key": "ddr_def456_0987654321" },
      });
      expect(extractApiKey(request)).toBe("ddr_def456_0987654321");
    });

    it("should prefer Authorization header over X-API-Key", () => {
      const request = new Request("https://example.com/api/test", {
        headers: {
          Authorization: "Bearer ddr_auth_header_123",
          "X-API-Key": "ddr_apikey_header_456",
        },
      });
      expect(extractApiKey(request)).toBe("ddr_auth_header_123");
    });

    it("should return null when no API key header present", () => {
      const request = new Request("https://example.com/api/test", {
        headers: { "Content-Type": "application/json" },
      });
      expect(extractApiKey(request)).toBeNull();
    });

    it("should return null for empty Authorization header", () => {
      const request = new Request("https://example.com/api/test", {
        headers: { Authorization: "" },
      });
      expect(extractApiKey(request)).toBeNull();
    });

    it("should handle Authorization header without Bearer prefix", () => {
      const request = new Request("https://example.com/api/test", {
        headers: { Authorization: "ddr_direct_key_123" },
      });
      expect(extractApiKey(request)).toBeNull();
    });

    it("should handle Bearer with empty token", () => {
      const request = new Request("https://example.com/api/test", {
        headers: { Authorization: "Bearer " },
      });
      const key = extractApiKey(request);
      expect(key === "" || key === null).toBe(true);
    });

    it("should be case-insensitive for header names", () => {
      const request = new Request("https://example.com/api/test", {
        headers: { authorization: "Bearer ddr_lower_case_123" },
      });
      expect(extractApiKey(request)).toBe("ddr_lower_case_123");
    });
  });
});
