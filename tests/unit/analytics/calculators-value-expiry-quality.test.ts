import { describe, it, expect } from "vitest";
import type { Deal, LogEntry } from "../../../worker/types";
import type { PipelineMetrics } from "../../../worker/lib/metrics";
import {
  calculateValueDistribution,
  calculateExpiringSoon,
  calculateQualityMetrics,
} from "../../../worker/lib/analytics/calculators";

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

describe("Analytics: Value Distribution", () => {
  it("should return all ranges for empty deals", () => {
    const result = calculateValueDistribution([]);
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.range)).toEqual([
      "0-50",
      "50-100",
      "100-500",
      "500+",
    ]);
  });

  it("should distribute deals into correct ranges", () => {
    const deals: Deal[] = [
      createMockDeal({ id: "1", reward: { type: "cash", value: 25 } }),
      createMockDeal({ id: "2", reward: { type: "cash", value: 75 } }),
      createMockDeal({ id: "3", reward: { type: "cash", value: 200 } }),
      createMockDeal({ id: "4", reward: { type: "cash", value: 1000 } }),
    ];

    const result = calculateValueDistribution(deals);
    expect(result.find((r) => r.range === "0-50")?.count).toBe(1);
    expect(result.find((r) => r.range === "50-100")?.count).toBe(1);
    expect(result.find((r) => r.range === "100-500")?.count).toBe(1);
    expect(result.find((r) => r.range === "500+")?.count).toBe(1);
  });

  it("should calculate percentages correctly", () => {
    const deals: Deal[] = [
      createMockDeal({ id: "1", reward: { type: "cash", value: 10 } }),
      createMockDeal({ id: "2", reward: { type: "cash", value: 20 } }),
      createMockDeal({ id: "3", reward: { type: "cash", value: 300 } }),
    ];

    const result = calculateValueDistribution(deals);
    expect(result.find((r) => r.range === "0-50")?.percentage).toBe(66.7);
    expect(result.find((r) => r.range === "100-500")?.percentage).toBe(33.3);
  });

  it("should skip deals with non-numeric values", () => {
    const deals: Deal[] = [
      createMockDeal({ id: "1", reward: { type: "cash", value: 50 } }),
      createMockDeal({
        id: "2",
        reward: { type: "item", value: "free trial" },
      }),
    ];

    const result = calculateValueDistribution(deals);
    const total = result.reduce((sum, r) => sum + r.count, 0);
    expect(total).toBe(1);
  });

  it("should handle boundary values correctly", () => {
    const deals: Deal[] = [
      createMockDeal({ id: "1", reward: { type: "cash", value: 0 } }),
      createMockDeal({ id: "2", reward: { type: "cash", value: 50 } }),
      createMockDeal({ id: "3", reward: { type: "cash", value: 100 } }),
      createMockDeal({ id: "4", reward: { type: "cash", value: 500 } }),
    ];

    const result = calculateValueDistribution(deals);
    expect(result.find((r) => r.range === "0-50")?.count).toBe(1);
    expect(result.find((r) => r.range === "50-100")?.count).toBe(1);
    expect(result.find((r) => r.range === "100-500")?.count).toBe(1);
    expect(result.find((r) => r.range === "500+")?.count).toBe(1);
  });

  it("should return 0 percentage when no numeric deals exist", () => {
    const deals: Deal[] = [
      createMockDeal({ id: "1", reward: { type: "item", value: "bonus" } }),
    ];

    const result = calculateValueDistribution(deals);
    result.forEach((r) => {
      expect(r.count).toBe(0);
      expect(r.percentage).toBe(0);
    });
  });
});

describe("Analytics: Expiring Soon", () => {
  it("should return zeros for empty deals", () => {
    const result = calculateExpiringSoon([]);
    expect(result.next7Days).toBe(0);
    expect(result.next30Days).toBe(0);
    expect(result.next90Days).toBe(0);
  });

  it("should count deals expiring within each window", () => {
    const now = new Date();
    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);
    const in15Days = new Date(now);
    in15Days.setDate(in15Days.getDate() + 15);
    const in60Days = new Date(now);
    in60Days.setDate(in60Days.getDate() + 60);

    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        expiry: { date: in3Days.toISOString(), confidence: 0.9, type: "hard" },
      }),
      createMockDeal({
        id: "2",
        expiry: { date: in15Days.toISOString(), confidence: 0.9, type: "hard" },
      }),
      createMockDeal({
        id: "3",
        expiry: { date: in60Days.toISOString(), confidence: 0.9, type: "hard" },
      }),
    ];

    const result = calculateExpiringSoon(deals);
    expect(result.next7Days).toBe(1);
    expect(result.next30Days).toBe(2);
    expect(result.next90Days).toBe(3);
  });

  it("should not count already expired deals", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        expiry: {
          date: yesterday.toISOString(),
          confidence: 0.9,
          type: "hard",
        },
      }),
    ];

    const result = calculateExpiringSoon(deals);
    expect(result.next7Days).toBe(0);
    expect(result.next30Days).toBe(0);
    expect(result.next90Days).toBe(0);
  });

  it("should skip deals without expiry date", () => {
    const deals: Deal[] = [
      createMockDeal({ id: "1", expiry: { confidence: 0.5, type: "unknown" } }),
    ];

    const result = calculateExpiringSoon(deals);
    expect(result.next7Days).toBe(0);
  });

  it("should count deals at exact boundaries", () => {
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    in7Days.setHours(0, 0, 0, 0);

    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        expiry: { date: in7Days.toISOString(), confidence: 0.9, type: "hard" },
      }),
    ];

    const result = calculateExpiringSoon(deals);
    expect(result.next7Days).toBe(1);
  });
});

describe("Analytics: Quality Metrics", () => {
  it("should return zeros for empty deals", () => {
    const result = calculateQualityMetrics([], [], [] as PipelineMetrics[]);
    expect(result.avgConfidence).toBe(0);
    expect(result.validationSuccessRate).toBe(100);
    expect(result.quarantineRate).toBe(0);
  });

  it("should calculate average confidence", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.6,
          status: "active",
        },
      }),
      createMockDeal({
        id: "2",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
      createMockDeal({
        id: "3",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 1.0,
          status: "active",
        },
      }),
    ];

    const result = calculateQualityMetrics(deals, [], [] as PipelineMetrics[]);
    expect(result.avgConfidence).toBe(0.8);
  });

  it("should calculate validation success rate from logs", () => {
    const logs: LogEntry[] = [
      createMockLog({ phase: "validate", candidate_count: 10, valid_count: 8 }),
      createMockLog({ phase: "validate", candidate_count: 5, valid_count: 4 }),
    ];

    const result = calculateQualityMetrics([], logs, [] as PipelineMetrics[]);
    expect(result.validationSuccessRate).toBe(80);
  });

  it("should return 100% validation rate when no validation logs exist", () => {
    const result = calculateQualityMetrics([], [], [] as PipelineMetrics[]);
    expect(result.validationSuccessRate).toBe(100);
  });

  it("should calculate quarantine rate", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
      createMockDeal({
        id: "2",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "quarantined",
        },
      }),
      createMockDeal({
        id: "3",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
      createMockDeal({
        id: "4",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "quarantined",
        },
      }),
    ];

    const result = calculateQualityMetrics(deals, [], [] as PipelineMetrics[]);
    expect(result.quarantineRate).toBe(50);
  });

  it("should handle validation logs with zero candidates", () => {
    const logs: LogEntry[] = [
      createMockLog({ phase: "validate", candidate_count: 0, valid_count: 0 }),
    ];

    const result = calculateQualityMetrics([], logs, [] as PipelineMetrics[]);
    expect(result.validationSuccessRate).toBe(100);
  });
});
