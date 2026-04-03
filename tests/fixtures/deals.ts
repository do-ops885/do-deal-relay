/**
 * Test Fixtures for Deal Discovery System
 *
 * Provides mock data for testing deal discovery, categorization,
 * and ranking functionality across unit, integration, and e2e tests.
 */

import type { Deal, Source, DealMetadata } from "../../worker/types";

// ============================================================================
// Sample Deals
// ============================================================================

export const sampleDeals: Deal[] = [
  {
    id: "deal-001",
    title: "Get $50 when you open a Trading212 account",
    description:
      "Open a Trading212 Invest account and deposit $1 to get $50 free share",
    code: "ABC123",
    url: "https://www.trading212.com/referral/ABC123",
    source: {
      url: "https://www.trading212.com/referral",
      domain: "trading212.com",
      discovered_at: new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trust_score: 0.95,
    },
    reward: {
      type: "cash",
      value: 50,
      currency: "USD",
      description: "$50 free share on signup",
    },
    requirements: ["New account", "Minimum $1 deposit"],
    expiry: {
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 0.9,
      type: "hard",
    },
    metadata: {
      category: ["finance"],
      tags: ["brokerage", "stocks", "signup-bonus"],
      normalized_at: new Date(
        Date.now() - 4 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      confidence_score: 0.92,
      status: "active",
    },
  },
  {
    id: "deal-002",
    title: "DoorDash - $30 off first 3 orders",
    description: "New customers get $10 off each of their first 3 orders",
    code: "DD50OFF",
    url: "https://www.doordash.com/consumer/referral/DD50OFF",
    source: {
      url: "https://www.doordash.com/referral",
      domain: "doordash.com",
      discovered_at: new Date(
        Date.now() - 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trust_score: 0.75,
    },
    reward: {
      type: "credit",
      value: 30,
      currency: "USD",
      description: "$10 off each of first 3 orders",
    },
    requirements: ["New customer", "Minimum order $15"],
    expiry: {
      date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 0.8,
      type: "soft",
    },
    metadata: {
      category: ["food_delivery"],
      tags: ["delivery", "food", "signup-bonus"],
      normalized_at: new Date(
        Date.now() - 1 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      confidence_score: 0.78,
      status: "active",
    },
  },
  {
    id: "deal-003",
    title: "Uber - $20 ride credit",
    description:
      "Get $20 off your first ride when you sign up with referral code",
    code: "UBER20",
    url: "https://www.uber.com/referral/UBER20",
    source: {
      url: "https://www.uber.com/referral",
      domain: "uber.com",
      discovered_at: new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trust_score: 0.88,
    },
    reward: {
      type: "credit",
      value: 20,
      currency: "USD",
      description: "$20 ride credit for new users",
    },
    requirements: ["New user", "First ride only"],
    expiry: {
      date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 0.85,
      type: "soft",
    },
    metadata: {
      category: ["transportation"],
      tags: ["rideshare", "signup-bonus"],
      normalized_at: new Date(
        Date.now() - 9 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      confidence_score: 0.85,
      status: "active",
    },
  },
  {
    id: "deal-004",
    title: "Robinhood - Free stock worth $5-$200",
    description: "Sign up and link bank account to get free fractional shares",
    code: "ROBIN123",
    url: "https://join.robinhood.com/ROBIN123",
    source: {
      url: "https://join.robinhood.com",
      domain: "robinhood.com",
      discovered_at: new Date(
        Date.now() - 1 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trust_score: 0.92,
    },
    reward: {
      type: "item",
      value: "Free stock",
      currency: "USD",
      description: "Free fractional shares worth $5-$200",
    },
    requirements: ["New account", "Link bank account"],
    expiry: {
      date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 0.88,
      type: "soft",
    },
    metadata: {
      category: ["finance"],
      tags: ["brokerage", "stocks", "signup-bonus"],
      normalized_at: new Date().toISOString(),
      confidence_score: 0.89,
      status: "active",
    },
  },
  {
    id: "deal-005",
    title: "Airbnb - $55 off first trip",
    description: "New users get $40 off home booking + $15 off experience",
    code: "airbnb55",
    url: "https://www.airbnb.com/r/airbnb55",
    source: {
      url: "https://www.airbnb.com/r",
      domain: "airbnb.com",
      discovered_at: new Date(
        Date.now() - 20 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trust_score: 0.82,
    },
    reward: {
      type: "credit",
      value: 55,
      currency: "USD",
      description: "$40 off stay + $15 off experience",
    },
    requirements: ["New account", "First booking"],
    expiry: {
      date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 0.95,
      type: "hard",
    },
    metadata: {
      category: ["travel"],
      tags: ["vacation", "accommodation", "signup-bonus"],
      normalized_at: new Date(
        Date.now() - 19 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      confidence_score: 0.81,
      status: "active",
    },
  },
  {
    id: "deal-006",
    title: "Dropbox - 500MB bonus space per referral",
    description: "Refer friends and get 500MB bonus space per referral",
    code: "DBX123",
    url: "https://www.dropbox.com/referral/DBX123",
    source: {
      url: "https://www.dropbox.com/referral",
      domain: "dropbox.com",
      discovered_at: new Date(
        Date.now() - 15 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trust_score: 0.9,
    },
    reward: {
      type: "item",
      value: "500MB storage",
      description: "500MB bonus space per referral",
    },
    requirements: ["Referral only", "Friend must sign up"],
    expiry: {
      confidence: 0.6,
      type: "unknown",
    },
    metadata: {
      category: ["software"],
      tags: ["storage", "cloud", "referral-bonus"],
      normalized_at: new Date(
        Date.now() - 14 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      confidence_score: 0.65,
      status: "active",
    },
  },
  {
    id: "deal-007",
    title: "Netflix - Referral program discontinued",
    description: "Netflix no longer offers a referral program",
    code: "N/A",
    url: "https://www.netflix.com",
    source: {
      url: "https://www.netflix.com",
      domain: "netflix.com",
      discovered_at: new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trust_score: 0.7,
    },
    reward: {
      type: "cash",
      value: 0,
      currency: "USD",
      description: "No referral program available",
    },
    requirements: [],
    expiry: {
      date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 1.0,
      type: "hard",
    },
    metadata: {
      category: ["entertainment"],
      tags: ["streaming", "inactive"],
      normalized_at: new Date(
        Date.now() - 29 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      confidence_score: 0.1,
      status: "rejected",
    },
  },
  {
    id: "deal-008",
    title: "Webull - 12 free stocks",
    description: "Open account and deposit any amount to get 12 free stocks",
    code: "WEBULL12",
    url: "https://www.webull.com/referral/WEBULL12",
    source: {
      url: "https://www.webull.com/referral",
      domain: "webull.com",
      discovered_at: new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trust_score: 0.88,
    },
    reward: {
      type: "item",
      value: "12 free stocks",
      currency: "USD",
      description: "12 free stocks worth $180 avg",
    },
    requirements: ["New account", "Any deposit amount"],
    expiry: {
      date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 0.85,
      type: "soft",
    },
    metadata: {
      category: ["finance"],
      tags: ["brokerage", "stocks", "signup-bonus"],
      normalized_at: new Date(
        Date.now() - 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      confidence_score: 0.93,
      status: "active",
    },
  },
];

// ============================================================================
// Category Keywords (for testing categorization logic)
// ============================================================================

export const categoryKeywords: Record<string, string[]> = {
  finance: [
    "stock",
    "trading",
    "invest",
    "bank",
    "credit card",
    "crypto",
    "money",
    "brokerage",
  ],
  food_delivery: [
    "food",
    "delivery",
    "meal",
    "grocery",
    "restaurant",
    "doordash",
    "uber eats",
  ],
  transportation: [
    "ride",
    "uber",
    "lyft",
    "car",
    "transport",
    "taxi",
    "rideshare",
  ],
  travel: [
    "hotel",
    "flight",
    "airbnb",
    "booking",
    "trip",
    "vacation",
    "accommodation",
  ],
  shopping: [
    "shop",
    "store",
    "amazon",
    "retail",
    "discount",
    "coupon",
    "cashback",
  ],
  cloud_storage: [
    "storage",
    "cloud",
    "dropbox",
    "google drive",
    "onedrive",
    "backup",
  ],
  communication: ["phone", "mobile", "internet", "sms", "call", "voip"],
  entertainment: [
    "netflix",
    "spotify",
    "streaming",
    "music",
    "movie",
    "entertainment",
  ],
  health: ["gym", "fitness", "health", "medical", "wellness", "workout"],
  education: ["course", "learn", "education", "tutorial", "bootcamp"],
  software: ["app", "software", "saas", "tool", "service", "subscription"],
};

// ============================================================================
// Invalid/Edge Case Fixtures
// ============================================================================

export const invalidDeals = {
  missingTitle: {
    id: "invalid-001",
    title: "",
    description: "This deal has no title",
    code: "TEST123",
    url: "https://example.com",
    source: {
      url: "https://example.com",
      domain: "example.com",
      discovered_at: new Date().toISOString(),
      trust_score: 0.5,
    },
    reward: {
      type: "cash",
      value: 10,
      currency: "USD",
    },
    requirements: [],
    expiry: {
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 0.5,
      type: "unknown",
    },
    metadata: {
      category: ["other"],
      tags: ["test"],
      normalized_at: new Date().toISOString(),
      confidence_score: 0.3,
      status: "rejected",
    },
  } as Deal,

  invalidUrl: {
    id: "invalid-002",
    title: "Deal with bad URL",
    description: "This deal has an invalid URL format",
    code: "BADURL",
    url: "not-a-valid-url",
    source: {
      url: "not-a-valid-url",
      domain: "invalid",
      discovered_at: new Date().toISOString(),
      trust_score: 0.3,
    },
    reward: {
      type: "cash",
      value: 10,
      currency: "USD",
    },
    requirements: [],
    expiry: {
      confidence: 0.3,
      type: "unknown",
    },
    metadata: {
      category: ["other"],
      tags: ["invalid"],
      normalized_at: new Date().toISOString(),
      confidence_score: 0.2,
      status: "rejected",
    },
  } as Deal,

  expired: {
    id: "invalid-003",
    title: "Expired Deal",
    description: "This deal has already expired",
    code: "EXPIRED",
    url: "https://example.com/expired",
    source: {
      url: "https://example.com",
      domain: "example.com",
      discovered_at: new Date(
        Date.now() - 60 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trust_score: 0.6,
    },
    reward: {
      type: "cash",
      value: 50,
      currency: "USD",
    },
    requirements: [],
    expiry: {
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 1.0,
      type: "hard",
    },
    metadata: {
      category: ["other"],
      tags: ["expired"],
      normalized_at: new Date(
        Date.now() - 59 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      confidence_score: 0.15,
      status: "rejected",
    },
  } as Deal,

  highValue: {
    id: "special-001",
    title: "Premium Account $500 Bonus",
    description: "High-value deal that should trigger notifications",
    code: "HIGH500",
    url: "https://premiumbank.com/referral/HIGH500",
    source: {
      url: "https://premiumbank.com",
      domain: "premiumbank.com",
      discovered_at: new Date().toISOString(),
      trust_score: 0.8,
    },
    reward: {
      type: "cash",
      value: 500,
      currency: "USD",
      description: "$500 bonus for new premium accounts",
    },
    requirements: ["New account", "Deposit $10,000"],
    expiry: {
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 0.9,
      type: "hard",
    },
    metadata: {
      category: ["finance"],
      tags: ["high-value", "premium", "signup-bonus"],
      normalized_at: new Date().toISOString(),
      confidence_score: 0.95,
      status: "active",
    },
  } as Deal,
};

// ============================================================================
// Helper Functions
// ============================================================================

export function createMockDeal(overrides: Partial<Deal> = {}): Deal {
  const now = new Date();
  const defaultDeal: Deal = {
    id: `deal-${Date.now()}`,
    title: "Mock Deal",
    description: "A mock deal for testing",
    code: `CODE${Math.floor(Math.random() * 1000)}`,
    url: "https://example.com/referral/TEST123",
    source: {
      url: "https://example.com/referral",
      domain: "example.com",
      discovered_at: now.toISOString(),
      trust_score: 0.75,
    },
    reward: {
      type: "cash",
      value: 25,
      currency: "USD",
    },
    requirements: ["New user"],
    expiry: {
      date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      confidence: 0.8,
      type: "soft",
    },
    metadata: {
      category: ["other"],
      tags: ["test"],
      normalized_at: now.toISOString(),
      confidence_score: 0.75,
      status: "active",
    },
  };

  return { ...defaultDeal, ...overrides };
}

export function getDealsByCategory(category: string): Deal[] {
  return sampleDeals.filter((deal) =>
    deal.metadata.category.includes(category),
  );
}

export function getActiveDeals(): Deal[] {
  return sampleDeals.filter((deal) => {
    const isActive = deal.metadata.status === "active";
    const notExpired =
      !deal.expiry.date || new Date(deal.expiry.date) > new Date();
    return isActive && notExpired;
  });
}

export function getRejectedDeals(): Deal[] {
  return sampleDeals.filter((deal) => deal.metadata.status === "rejected");
}

export function getHighValueDeals(threshold: number = 100): Deal[] {
  return sampleDeals.filter((deal) => {
    const value = typeof deal.reward.value === "number" ? deal.reward.value : 0;
    return value >= threshold;
  });
}

// ============================================================================
// Analytics Fixtures
// ============================================================================

export const analyticsFixtures = {
  summary: {
    total_deals: sampleDeals.length,
    active_deals: getActiveDeals().length,
    total_value_usd: sampleDeals.reduce((sum, deal) => {
      const value =
        typeof deal.reward.value === "number" ? deal.reward.value : 0;
      return sum + value;
    }, 0),
    avg_value_usd:
      sampleDeals.reduce((sum, deal) => {
        const value =
          typeof deal.reward.value === "number" ? deal.reward.value : 0;
        return sum + value;
      }, 0) / sampleDeals.length,
    sources_count: new Set(sampleDeals.map((d) => d.source.domain)).size,
    expiring_7d: sampleDeals.filter((d) => {
      if (!d.expiry.date) return false;
      const days =
        (new Date(d.expiry.date).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24);
      return days > 0 && days <= 7;
    }).length,
    expiring_30d: sampleDeals.filter((d) => {
      if (!d.expiry.date) return false;
      const days =
        (new Date(d.expiry.date).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24);
      return days > 0 && days <= 30;
    }).length,
  },
  categories: Object.entries(
    sampleDeals.reduce(
      (acc, deal) => {
        deal.metadata.category.forEach((cat) => {
          acc[cat] = (acc[cat] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).map(([category, count]) => ({ category, count })),
  sources: Object.entries(
    sampleDeals.reduce(
      (acc, deal) => {
        acc[deal.source.domain] = (acc[deal.source.domain] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).map(([source, count]) => ({ source, count })),
};
