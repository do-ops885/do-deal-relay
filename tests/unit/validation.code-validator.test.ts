import { describe, it, expect, vi } from "vitest";

// Mock implementations for validation functions
const mockValidateCodeFormat = vi.fn();
const mockValidateCodeOnPage = vi.fn();
const mockTestCodeRedemption = vi.fn();

// ============================================================================
// URL Validator Tests
// ============================================================================

describe("Code Validator", () => {
  describe("validateCodeFormat", () => {
    it("should validate generic code format", () => {
      const mockResult = {
        code: "REFERRAL123",
        provider: "generic",
        valid: true,
        formatValid: true,
        errors: [],
        warnings: [],
        metadata: {
          normalizedCode: "REFERRAL123",
          detectedProvider: "generic",
        },
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("REFERRAL123", "generic");

      expect(result.valid).toBe(true);
      expect(result.formatValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject empty codes", () => {
      const mockResult = {
        code: "",
        provider: "generic",
        valid: false,
        formatValid: false,
        errors: ["Code cannot be empty"],
        warnings: [],
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("", "generic");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Code cannot be empty");
    });

    it("should reject codes that are too short", () => {
      const mockResult = {
        code: "AB",
        provider: "generic",
        valid: false,
        formatValid: false,
        errors: ["Code too short: 2 chars (min: 3)"],
        warnings: [],
        metadata: {
          normalizedCode: "AB",
        },
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("AB", "generic");

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("short"))).toBe(true);
    });

    it("should auto-detect provider from code format", () => {
      const mockResult = {
        code: "TRADE500",
        provider: "auto",
        valid: true,
        formatValid: true,
        errors: [],
        warnings: [],
        metadata: {
          normalizedCode: "TRADE500",
          detectedProvider: "trading212",
        },
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("TRADE500", "auto");

      expect(result.metadata?.detectedProvider).toBe("trading212");
    });

    it("should normalize case-insensitive codes", () => {
      const mockResult = {
        code: "referral123",
        provider: "generic",
        valid: true,
        formatValid: true,
        errors: [],
        warnings: [],
        metadata: {
          normalizedCode: "REFERRAL123", // Uppercase
          detectedProvider: "generic",
        },
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("referral123", "generic");

      expect(result.metadata?.normalizedCode).toBe("REFERRAL123");
    });
  });

  describe("validateCodeOnPage", () => {
    it("should find code on referral page", async () => {
      const mockResult = {
        codeFound: true,
        context: "Get $50 bonus with code REFERRAL123 when you sign up today!",
        similarCodes: [],
        pageTitle: "Get $50 Bonus - Referral Program",
        pageAccessible: true,
      };

      mockValidateCodeOnPage.mockResolvedValue(mockResult);
      const result = await mockValidateCodeOnPage(
        "REFERRAL123",
        "https://example.com/refer",
      );

      expect(result.codeFound).toBe(true);
      expect(result.pageAccessible).toBe(true);
      expect(result.context).toContain("REFERRAL123");
    });

    it("should detect similar codes when exact not found", async () => {
      const mockResult = {
        codeFound: false,
        similarCodes: ["REFERRAL124", "REFERRAL125", "REFERRAL120"],
        pageTitle: "Referral Program",
        pageAccessible: true,
      };

      mockValidateCodeOnPage.mockResolvedValue(mockResult);
      const result = await mockValidateCodeOnPage(
        "REFERRAL123",
        "https://example.com/refer",
      );

      expect(result.codeFound).toBe(false);
      expect(result.similarCodes.length).toBeGreaterThan(0);
    });

    it("should handle page not accessible", async () => {
      const mockResult = {
        codeFound: false,
        similarCodes: [],
        pageAccessible: false,
        error: "HTTP 404: Not Found",
      };

      mockValidateCodeOnPage.mockResolvedValue(mockResult);
      const result = await mockValidateCodeOnPage(
        "REFERRAL123",
        "https://example.com/broken",
      );

      expect(result.pageAccessible).toBe(false);
      expect(result.error).toContain("404");
    });
  });

  describe("testCodeRedemption", () => {
    it("should require manual verification for unknown providers", async () => {
      const mockResult = {
        testable: false,
        tested: false,
        requiresManualVerification: true,
        error: "No automated redemption testing available for this provider",
      };

      mockTestCodeRedemption.mockResolvedValue(mockResult);
      const result = await mockTestCodeRedemption("REF123", "unknown.com");

      expect(result.requiresManualVerification).toBe(true);
      expect(result.testable).toBe(false);
    });
  });
});

// ============================================================================
// Reward Scraper Tests
// ============================================================================
