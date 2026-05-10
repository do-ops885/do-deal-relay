import type { Deal } from "../worker/types";

export function generateTestDeals(count: number): Deal[] {
  const deals: Deal[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < count; i++) {
    deals.push({
      id: `deal-${i}`,
      source: {
        url: `https://example.com/source/${i}`,
        domain: "example.com",
        discovered_at: now,
        trust_score: 0.5 + Math.random() * 0.5,
      },
      title: `Test Deal ${i}`,
      description: `Description for test deal ${i}`,
      code: `CODE${i}`,
      url: `https://example.com/deal/${i}`,
      reward: {
        type: "cash",
        value: 10 + i,
        currency: "USD",
      },
      expiry: {
        date: new Date(Date.now() + 86400000 * 30).toISOString(),
        confidence: 0.9,
        type: "hard",
      },
      metadata: {
        category: ["tech"],
        tags: ["test"],
        normalized_at: now,
        confidence_score: 0.5 + Math.random() * 0.5,
        status: "active",
      },
    });
  }

  return deals;
}
