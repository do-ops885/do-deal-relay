import { describe, it, expect } from "vitest";
import type { Deal, LogEntry } from "../../../worker/types";
import { calculateDealsOverTime } from "../../../worker/lib/analytics/calculators";

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
    category: overrides.metadata?.category || ["referral"],
    tags: overrides.metadata?.tags || ["test"],
    normalized_at: overrides.metadata?.normalized_at || "2024-03-31T00:00:00Z",
    confidence_score: overrides.metadata?.confidence_score ?? 0.75,
    status: overrides.metadata?.status || "active",
  },
});

const createMockLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  run_id: overrides.run_id || "run-1",
  trace_id: overrides.trace_id || "trace-1",
  ts: overrides.ts || "2024-03-31T12:00:00Z",
  phase: overrides.phase || "discover",
  status: overrides.status || "complete",
  candidate_count: overrides.candidate_count,
  valid_count: overrides.valid_count,
});

describe("Analytics: Deals Over Time", () => {
  it("should return correct number of day buckets", () => {
    const result = calculateDealsOverTime([], [], 7);
    expect(result).toHaveLength(7);
  });

  it("should return single day bucket for days=1", () => {
    const result = calculateDealsOverTime([], [], 1);
    expect(result).toHaveLength(1);
  });

  it("should have zero counts for empty inputs", () => {
    const result = calculateDealsOverTime([], [], 3);
    result.forEach((day) => {
      expect(day.discovered).toBe(0);
      expect(day.published).toBe(0);
      expect(day.expired).toBe(0);
    });
  });

  it("should count discover logs correctly", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const logs: LogEntry[] = [
      createMockLog({
        ts: today.toISOString(),
        phase: "discover",
        candidate_count: 5,
      }),
      createMockLog({
        ts: today.toISOString(),
        phase: "discover",
        candidate_count: 3,
      }),
    ];

    const result = calculateDealsOverTime([], logs, 1);
    expect(result[0].discovered).toBe(2);
  });

  it("should not count discover logs without candidate_count", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const logs: LogEntry[] = [
      createMockLog({
        ts: today.toISOString(),
        phase: "discover",
        candidate_count: undefined,
      }),
    ];

    const result = calculateDealsOverTime([], logs, 1);
    expect(result[0].discovered).toBe(0);
  });

  it("should count publish logs with complete status", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const logs: LogEntry[] = [
      createMockLog({
        ts: today.toISOString(),
        phase: "publish",
        status: "complete",
      }),
      createMockLog({
        ts: today.toISOString(),
        phase: "publish",
        status: "complete",
      }),
      createMockLog({
        ts: today.toISOString(),
        phase: "publish",
        status: "incomplete",
      }),
    ];

    const result = calculateDealsOverTime([], logs, 1);
    expect(result[0].published).toBe(2);
  });

  it("should count expired deals correctly", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const deals: Deal[] = [
      createMockDeal({
        id: "expired-1",
        expiry: {
          date: yesterday.toISOString(),
          confidence: 0.9,
          type: "hard",
        },
        metadata: {
          category: ["finance"],
          tags: [],
          normalized_at: "2024-03-31T00:00:00Z",
          confidence_score: 0.8,
          status: "rejected",
        },
      }),
      createMockDeal({
        id: "active-1",
        expiry: {
          date: yesterday.toISOString(),
          confidence: 0.9,
          type: "hard",
        },
        metadata: {
          category: ["finance"],
          tags: [],
          normalized_at: "2024-03-31T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const result = calculateDealsOverTime(deals, [], 2);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const yesterdayBucket = result.find((d) => d.date === yesterdayStr);
    expect(yesterdayBucket?.expired).toBe(1);
  });

  it("should not count deals without expiry date as expired", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "no-expiry",
        expiry: { confidence: 0.5, type: "unknown" },
        metadata: {
          category: ["general"],
          tags: [],
          normalized_at: "2024-03-31T00:00:00Z",
          confidence_score: 0.5,
          status: "rejected",
        },
      }),
    ];

    const result = calculateDealsOverTime(deals, [], 1);
    expect(result[0].expired).toBe(0);
  });

  it("should produce date strings in ISO format", () => {
    const result = calculateDealsOverTime([], [], 3);
    result.forEach((day) => {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
