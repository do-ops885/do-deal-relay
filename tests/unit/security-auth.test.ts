import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticateD1Request } from "../../worker/routes/d1/admin";
import { authenticateRequest } from "../../worker/lib/auth";
import type { Env } from "../../worker/types";

describe("Security: Authentication Bypasses Fixed", () => {
  describe("authenticateD1Request", () => {
    it("should block any API key if WEBHOOK_API_KEYS binding is missing", async () => {
      const mockEnv = {
        // WEBHOOK_API_KEYS is missing
      } as unknown as Env;

      const request = new Request("https://example.com/api/d1/migrations", {
        headers: { "X-API-Key": "any-arbitrary-key" },
      });

      const result = await authenticateD1Request(mockEnv, request);

      // FIXED: Should now return false
      expect(result).toBe(false);
    });

    it("should block if API key is missing", async () => {
      const mockEnv = {} as unknown as Env;
      const request = new Request("https://example.com/api/d1/migrations");
      const result = await authenticateD1Request(mockEnv, request);
      expect(result).toBe(false);
    });
  });

  describe("authenticateRequest", () => {
    it("should block anonymous access even if no keys exist in KV", async () => {
      const mockEnv = {
        DEALS_SOURCES: {
          // list should not even be called now
          list: vi.fn(),
        },
      } as unknown as Env;

      const request = new Request("https://example.com/api/submit");
      const result = await authenticateRequest(request, mockEnv);

      // FIXED: Should now return authenticated: false
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Missing API key");
    });
  });
});
