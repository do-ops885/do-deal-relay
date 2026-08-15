import { describe, it, expect } from "vitest";
import { countDealStatuses } from "../../worker/lib/deal-stats";
import type { Deal } from "../../worker/types";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockDeal(id: string, status: Deal["metadata"]["status"]): Deal {
  const now = "2026-01-01T00:00:00Z";
  return {
    id,
    source: {
      url: "https://example.com/invite",
      domain: "example.com",
      discovered_at: now,
      trust_score: 0.8,
    },
    title: `Deal ${id}`,
    description: `Description for deal ${id}`,
    code: `CODE${id}`,
    url: "https://example.com/invite",
    reward: {
      type: "cash",
      value: 10,
      currency: "USD",
    },
    expiry: {
      date: "2027-01-01T00:00:00Z",
      confidence: 0.9,
      type: "soft",
    },
    metadata: {
      category: ["test"],
      tags: ["test"],
      normalized_at: now,
      confidence_score: 0.8,
      status,
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("countDealStatuses", () => {
  it("returns zero counts for an empty array", () => {
    expect(countDealStatuses([])).toEqual({
      active: 0,
      quarantined: 0,
      rejected: 0,
    });
  });

  it("counts a single deal of each status", () => {
    const deals = [
      createMockDeal("1", "active"),
      createMockDeal("2", "quarantined"),
      createMockDeal("3", "rejected"),
    ];

    expect(countDealStatuses(deals)).toEqual({
      active: 1,
      quarantined: 1,
      rejected: 1,
    });
  });

  it("matches the previous multi-pass filter counts for mixed statuses", () => {
    const deals = [
      createMockDeal("1", "active"),
      createMockDeal("2", "rejected"),
      createMockDeal("3", "active"),
      createMockDeal("4", "quarantined"),
      createMockDeal("5", "rejected"),
      createMockDeal("6", "active"),
      createMockDeal("7", "rejected"),
    ];

    const expected = {
      active: deals.filter((d) => d.metadata.status === "active").length,
      quarantined: deals.filter((d) => d.metadata.status === "quarantined")
        .length,
      rejected: deals.filter((d) => d.metadata.status === "rejected").length,
    };

    expect(countDealStatuses(deals)).toEqual(expected);
  });

  it("counts all-active deals without miscounting", () => {
    const deals = Array.from({ length: 5 }, (_, i) =>
      createMockDeal(`${i}`, "active"),
    );

    expect(countDealStatuses(deals)).toEqual({
      active: 5,
      quarantined: 0,
      rejected: 0,
    });
  });

  it("counts only rejected deals when every deal is rejected", () => {
    const deals = Array.from({ length: 4 }, (_, i) =>
      createMockDeal(`${i}`, "rejected"),
    );

    expect(countDealStatuses(deals)).toEqual({
      active: 0,
      quarantined: 0,
      rejected: 4,
    });
  });

  it("sums all statuses to the total deal count", () => {
    const deals = [
      createMockDeal("1", "active"),
      createMockDeal("2", "quarantined"),
      createMockDeal("3", "quarantined"),
      createMockDeal("4", "rejected"),
    ];

    const counts = countDealStatuses(deals);
    expect(counts.active + counts.quarantined + counts.rejected).toBe(
      deals.length,
    );
  });
});
