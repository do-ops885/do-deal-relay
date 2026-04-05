import { describe, it, expect } from "vitest";
import type { Deal } from "../../../worker/types";
import { autoCategorize } from "../../../worker/lib/categorization/index";

// ============================================================================
// Test Helpers
// ============================================================================

const createMockDeal = (overrides: Partial<Deal> = {}): Deal => ({
  id: overrides.id || "deal-1",
  source: {
    url: overrides.source?.url || "https://example.com/ref",
    domain: overrides.source?.domain || "example.com",
    discovered_at: overrides.source?.discovered_at || "2024-03-31T00:00:00Z",
    trust_score: overrides.source?.trust_score ?? 0.7,
  },
  title: overrides.title || "Test Deal",
  description: overrides.description || "A test referral deal",
  code: overrides.code || "REF123",
  url: overrides.url || "https://example.com/ref/REF123",
  reward: {
    type: overrides.reward?.type || "cash",
    value: overrides.reward?.value ?? 50,
    currency: overrides.reward?.currency || "USD",
  },
  expiry: {
    date: overrides.expiry?.date,
    confidence: overrides.expiry?.confidence ?? 0.8,
    type: overrides.expiry?.type || "soft",
  },
  metadata: {
    category: overrides.metadata?.category || [],
    tags: overrides.metadata?.tags || [],
    normalized_at: overrides.metadata?.normalized_at || "2024-03-31T00:00:00Z",
    confidence_score: overrides.metadata?.confidence_score ?? 0.75,
    status: overrides.metadata?.status || "active",
  },
});

describe("Categorization: autoCategorize", () => {
  it("should assign finance category for known domain", () => {
    const deal = createMockDeal({
      source: {
        domain: "robinhood.com",
        url: "https://robinhood.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.8,
      },
      title: "Get $50 when you sign up",
      description: "Open a brokerage account and get free stock",
      code: "STOCK50",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("finance");
  });

  it("should assign food_delivery category for known domain", () => {
    const deal = createMockDeal({
      source: {
        domain: "doordash.com",
        url: "https://doordash.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.8,
      },
      title: "Free delivery on first order",
      description: "Sign up for DoorDash and get free food delivery",
      code: "FOOD20",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("food_delivery");
  });

  it("should assign travel category for hotel keywords", () => {
    const deal = createMockDeal({
      source: {
        domain: "unknown.com",
        url: "https://unknown.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.5,
      },
      title: "Hotel booking discount",
      description: "Book your next hotel stay and save 20% on accommodation",
      code: "TRAVEL20",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("travel");
  });

  it("should default to general category when no matches found", () => {
    const deal = createMockDeal({
      source: {
        domain: "obscure-site.xyz",
        url: "https://obscure-site.xyz/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.3,
      },
      title: "Random deal xyz",
      description: "Some random thing with no specific category keywords",
      code: "XYZ999",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("general");
  });

  it("should always include referral category", () => {
    const deal = createMockDeal({
      source: {
        domain: "robinhood.com",
        url: "https://robinhood.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.8,
      },
      title: "Refer a friend bonus",
      description: "Get $50 when you invite a friend",
      code: "REFER50",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("referral");
  });

  it("should not duplicate referral if already categorized", () => {
    const deal = createMockDeal({
      source: {
        domain: "robinhood.com",
        url: "https://robinhood.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.8,
      },
      title: "Refer a friend bonus",
      description: "Refer friends to our finance platform",
      code: "REFER50",
    });

    const result = autoCategorize(deal);
    const referralCount = result.category.filter(
      (c) => c === "referral",
    ).length;
    expect(referralCount).toBe(1);
  });

  it("should assign multiple categories for multi-domain deals", () => {
    const deal = createMockDeal({
      source: {
        domain: "amazon.com",
        url: "https://amazon.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.9,
      },
      title: "Shop and earn cashback",
      description: "Buy items on Amazon and get cashback rewards",
      code: "SHOP10",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("shopping");
  });

  it("should include domain as tag", () => {
    const deal = createMockDeal({
      source: {
        domain: "netflix.com",
        url: "https://netflix.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.8,
      },
      title: "Free month of streaming",
      description: "Sign up for Netflix and get a free month",
      code: "NETFLIX",
    });

    const result = autoCategorize(deal);
    expect(result.tags).toContain("netflix");
  });

  it("should include auto-categorized tag", () => {
    const deal = createMockDeal({
      title: "Some deal",
      description: "Some description",
      code: "TEST",
    });

    const result = autoCategorize(deal);
    expect(result.tags).toContain("auto-categorized");
  });

  it("should limit tags to maximum 8", () => {
    const deal = createMockDeal({
      source: {
        domain: "amazon.com",
        url: "https://amazon.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.9,
      },
      title: "Shop and earn cashback rewards with sign up bonus",
      description:
        "Buy items on Amazon and get cashback rewards monthly subscription",
      code: "SHOP10",
    });

    const result = autoCategorize(deal);
    expect(result.tags.length).toBeLessThanOrEqual(8);
  });

  it("should preserve existing metadata fields", () => {
    const deal = createMockDeal({
      metadata: {
        category: [],
        tags: [],
        normalized_at: "2024-06-15T10:00:00Z",
        confidence_score: 0.85,
        status: "active",
      },
    });

    const result = autoCategorize(deal);
    expect(result.confidence_score).toBe(0.85);
    expect(result.status).toBe("active");
    expect(result.normalized_at).toBe("2024-06-15T10:00:00Z");
  });

  it("should assign entertainment category for streaming keywords", () => {
    const deal = createMockDeal({
      source: {
        domain: "unknown.com",
        url: "https://unknown.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.5,
      },
      title: "Free streaming trial",
      description: "Watch movies and listen to music with free trial",
      code: "STREAM",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("entertainment");
  });

  it("should assign education category for course keywords", () => {
    const deal = createMockDeal({
      source: {
        domain: "unknown.com",
        url: "https://unknown.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.5,
      },
      title: "Learn to code for free",
      description: "Take online courses and earn certification",
      code: "LEARN",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("education");
  });

  it("should assign health category for fitness keywords", () => {
    const deal = createMockDeal({
      source: {
        domain: "unknown.com",
        url: "https://unknown.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.5,
      },
      title: "Gym membership discount",
      description: "Get fit with workout plans and wellness programs",
      code: "FITNESS",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("health");
  });

  it("should assign cloud_storage category for hosting keywords", () => {
    const deal = createMockDeal({
      source: {
        domain: "unknown.com",
        url: "https://unknown.com/ref",
        discovered_at: "2024-03-31T00:00:00Z",
        trust_score: 0.5,
      },
      title: "Free cloud storage",
      description: "Backup your files and sync data across devices",
      code: "CLOUD",
    });

    const result = autoCategorize(deal);
    expect(result.category).toContain("cloud_storage");
  });
});
