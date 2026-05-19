import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateCodeFormat,
  getSupportedProviders,
  getProviderFormat,
  validateCodeOnPage,
  validateCodeComplete,
} from "../../worker/lib/validation/code-validator";

describe("code-validator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  describe("validateCodeFormat", () => {
    it("should validate generic codes", () => {
      const result = validateCodeFormat("WELCOME2024", "generic");
      expect(result.valid).toBe(true);
      expect(result.formatValid).toBe(true);
    });

    it("should validate Trading 212 codes", () => {
      const result = validateCodeFormat("IITSL ltd", "trading212");
      expect(result.valid).toBe(true);
    });

    it("should block codes that are too short", () => {
      const result = validateCodeFormat("AB", "generic");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Code too short: 2 chars (min: 3)");
    });

    it("should block codes with invalid characters", () => {
      const result = validateCodeFormat("INV@LID", "generic");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("invalid characters");
    });

    it("should auto-detect providers", () => {
      const result = validateCodeFormat("IITSL ltd", "auto");
      expect(result.metadata?.detectedProvider).toBe("trading212");
    });
  });

  describe("getSupportedProviders", () => {
    it("should return a list of providers", () => {
      const providers = getSupportedProviders();
      expect(providers).toContain("generic");
      expect(providers).toContain("trading212");
    });
  });

  describe("getProviderFormat", () => {
    it("should return format for existing provider", () => {
      const format = getProviderFormat("trading212");
      expect(format).not.toBeNull();
      expect(format?.name).toBe("Trading 212");
    });

    it("should return null for non-existent provider", () => {
      const format = getProviderFormat("nonexistent");
      expect(format).toBeNull();
    });
  });

  describe("validateCodeOnPage", () => {
    it("should find code on page", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body>Use code REF123 for a bonus!</body></html>",
      });

      const result = await validateCodeOnPage("REF123", "https://example.com");
      expect(result.codeFound).toBe(true);
      expect(result.pageAccessible).toBe(true);
    });

    it("should handle page not found", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const result = await validateCodeOnPage("REF123", "https://example.com");
      expect(result.codeFound).toBe(false);
      expect(result.pageAccessible).toBe(false);
    });
  });

  describe("validateCodeComplete", () => {
    it("should perform full validation", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body>Code: PROMO50</body></html>",
      });

      const result = await validateCodeComplete("PROMO50", "generic", "https://example.com");
      expect(result.valid).toBe(true);
      expect(result.formatValid).toBe(true);
      expect(result.existsOnPage).toBe(true);
    });
  });
});
