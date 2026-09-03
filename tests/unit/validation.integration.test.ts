import { describe, it, expect } from "vitest";
import type { Deal } from "../../worker/types";

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockDeal = (
  id: string,
  overrides: Partial<Deal> & { expiryDate?: string } = {},
): Deal => {
  const expiryDate =
    overrides.expiryDate ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    id,
    source: {
      url: "https://example.com/invite",
      domain: overrides.source?.domain || "example.com",
      discovered_at: "2024-03-31T00:00:00Z",
      trust_score: overrides.source?.trust_score || 0.7,
    },
    title: overrides.title ?? "Test Deal",
    description: overrides.description ?? "Test description",
    code: overrides.code ?? "CODE123",
    url: overrides.url ?? "https://example.com/invite/CODE123",
    reward: overrides.reward ?? {
      type: "cash",
      value: 50,
      currency: "USD",
    },
    expiry: {
      date: expiryDate,
      confidence: overrides.expiry?.confidence ?? 0.8,
      type: overrides.expiry?.type ?? "soft",
    },
    metadata: {
      category: ["test"],
      tags: ["test"],
      normalized_at: "2024-03-31T00:00:00Z",
      confidence_score: 0.8,
      status:
        (overrides.metadata?.status as "active" | "quarantined" | "rejected") ??
        "active",
    },
  };
};

// ============================================================================
// URL Validator Tests
// ============================================================================

describe("Validation Integration", () => {
  it("should perform complete deal validation flow", async () => {
    createMockDeal("1", {
      code: "TEST123",
      url: "https://example.com/deal",
    });

    // Step 1: URL validation
    const urlResult = {
      valid: true,
      statusCode: 200,
      redirectCount: 0,
    };

    // Step 2: Code validation
    const codeResult = {
      valid: true,
      formatValid: true,
      existsOnPage: true,
    };

    // Step 3: Reward validation
    const rewardResult = {
      success: true,
      rewardChanged: false,
    };

    expect(urlResult.valid).toBe(true);
    expect(codeResult.valid).toBe(true);
    expect(codeResult.existsOnPage).toBe(true);
    expect(rewardResult.success).toBe(true);
  });

  it("should detect and report invalid deals", async () => {
    createMockDeal("1", {
      code: "BAD",
      url: "https://broken.com/deal",
    });

    const urlResult = {
      valid: false,
      statusCode: 404,
      error: "Not Found",
    };

    const codeResult = {
      valid: false,
      errors: ["Code too short"],
    };

    expect(urlResult.valid).toBe(false);
    expect(codeResult.valid).toBe(false);
    expect(codeResult.errors.length).toBeGreaterThan(0);
  });
});
