import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DealAnalytics } from "../../../worker/lib/analytics/types";
import { generateDashboardHTML } from "../../../worker/lib/analytics/dashboard";

// ============================================================================
// Test Helpers
// ============================================================================

const createMockAnalytics = (
  overrides: Partial<DealAnalytics> = {},
): DealAnalytics => ({
  dealsOverTime: overrides.dealsOverTime || [
    { date: "2024-03-25", discovered: 5, published: 3, expired: 1 },
    { date: "2024-03-26", discovered: 8, published: 5, expired: 2 },
    { date: "2024-03-27", discovered: 3, published: 2, expired: 0 },
  ],
  categoryBreakdown: overrides.categoryBreakdown || [
    { category: "finance", count: 15, avgConfidence: 0.82, avgValue: 120 },
    { category: "shopping", count: 10, avgConfidence: 0.75, avgValue: 45 },
    { category: "travel", count: 5, avgConfidence: 0.9, avgValue: 200 },
  ],
  sourcePerformance: overrides.sourcePerformance || [
    {
      domain: "robinhood.com",
      dealsDiscovered: 20,
      dealsPublished: 15,
      avgConfidence: 0.85,
      trustScore: 0.9,
    },
    {
      domain: "amazon.com",
      dealsDiscovered: 10,
      dealsPublished: 8,
      avgConfidence: 0.7,
      trustScore: 0.8,
    },
  ],
  valueDistribution: overrides.valueDistribution || [
    { range: "0-50", count: 12, percentage: 40 },
    { range: "50-100", count: 8, percentage: 26.7 },
    { range: "100-500", count: 7, percentage: 23.3 },
    { range: "500+", count: 3, percentage: 10 },
  ],
  expiringSoon: overrides.expiringSoon || {
    next7Days: 5,
    next30Days: 12,
    next90Days: 25,
  },
  qualityMetrics: overrides.qualityMetrics || {
    avgConfidence: 0.78,
    validationSuccessRate: 85.5,
    quarantineRate: 3.2,
  },
});

describe("Dashboard Generator", () => {
  describe("generateDashboardHTML", () => {
    it("should return valid HTML string", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
    });

    it("should include DOCTYPE declaration", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("<!DOCTYPE html>");
    });

    it("should include dashboard title", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("Deal Analytics Dashboard");
    });

    it("should include Chart.js script", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("chart.js");
    });

    it("should render quality metrics values", () => {
      const analytics = createMockAnalytics({
        qualityMetrics: {
          avgConfidence: 0.78,
          validationSuccessRate: 85.5,
          quarantineRate: 3.2,
        },
      });
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("78%");
      expect(html).toContain("85.5%");
      expect(html).toContain("3.2%");
    });

    it("should render expiry forecast values", () => {
      const analytics = createMockAnalytics({
        expiringSoon: { next7Days: 5, next30Days: 12, next90Days: 25 },
      });
      const html = generateDashboardHTML(analytics);
      expect(html).toContain(">5<");
      expect(html).toContain(">12<");
      expect(html).toContain(">25<");
    });

    it("should render source performance table", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("robinhood.com");
      expect(html).toContain("amazon.com");
      expect(html).toContain("Deals Discovered");
      expect(html).toContain("Trust Score");
    });

    it("should render volume chart data", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("2024-03-25");
      expect(html).toContain("2024-03-26");
      expect(html).toContain("2024-03-27");
    });

    it("should render category chart labels", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("finance");
      expect(html).toContain("shopping");
      expect(html).toContain("travel");
    });

    it("should render value distribution ranges", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("0-50");
      expect(html).toContain("50-100");
      expect(html).toContain("100-500");
      expect(html).toContain("500+");
    });

    it("should include responsive CSS", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("@media");
      expect(html).toContain("max-width: 768px");
    });

    it("should include trust score badges", () => {
      const analytics = createMockAnalytics({
        sourcePerformance: [
          {
            domain: "trusted.com",
            dealsDiscovered: 10,
            dealsPublished: 8,
            avgConfidence: 0.8,
            trustScore: 0.9,
          },
          {
            domain: "probationary.com",
            dealsDiscovered: 5,
            dealsPublished: 2,
            avgConfidence: 0.6,
            trustScore: 0.5,
          },
          {
            domain: "unverified.com",
            dealsDiscovered: 3,
            dealsPublished: 1,
            avgConfidence: 0.4,
            trustScore: 0.2,
          },
        ],
      });
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("Trusted");
      expect(html).toContain("Probationary");
      expect(html).toContain("Unverified");
    });

    it("should handle empty source performance", () => {
      const analytics = createMockAnalytics({
        sourcePerformance: [],
      });
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("<table>");
      expect(html).toContain("<tbody>");
    });

    it("should handle empty category breakdown", () => {
      const analytics = createMockAnalytics({
        categoryBreakdown: [],
      });
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("categoryChart");
    });

    it("should handle empty value distribution", () => {
      const analytics = createMockAnalytics({
        valueDistribution: [],
      });
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("valueChart");
    });

    it("should limit source table to 10 entries", () => {
      const sources = Array.from({ length: 15 }, (_, i) => ({
        domain: `source${i}.com`,
        dealsDiscovered: 100 - i,
        dealsPublished: 80 - i,
        avgConfidence: 0.7,
        trustScore: 0.6,
      }));

      const analytics = createMockAnalytics({ sourcePerformance: sources });
      const html = generateDashboardHTML(analytics);

      // Count table rows (each source creates a <tr>)
      const trMatches = html.match(/<tr>/g);
      // Should have header row + max 10 data rows
      expect(trMatches?.length).toBeLessThanOrEqual(11);
    });

    it("should include generated timestamp", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("Generated:");
    });

    it("should include all three chart canvases", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain('id="volumeChart"');
      expect(html).toContain('id="categoryChart"');
      expect(html).toContain('id="valueChart"');
    });

    it("should include chart type configurations", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("type: 'line'");
      expect(html).toContain("type: 'doughnut'");
      expect(html).toContain("type: 'bar'");
    });

    it("should handle zero quality metrics", () => {
      const analytics = createMockAnalytics({
        qualityMetrics: {
          avgConfidence: 0,
          validationSuccessRate: 0,
          quarantineRate: 0,
        },
      });
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("0%");
    });

    it("should handle zero expiry counts", () => {
      const analytics = createMockAnalytics({
        expiringSoon: { next7Days: 0, next30Days: 0, next90Days: 0 },
      });
      const html = generateDashboardHTML(analytics);
      expect(html).toContain(">0<");
    });

    it("should include metric labels", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("Avg Confidence");
      expect(html).toContain("Validation Rate");
      expect(html).toContain("Quarantine Rate");
      expect(html).toContain("Next 7 Days");
      expect(html).toContain("Next 30 Days");
      expect(html).toContain("Next 90 Days");
    });

    it("should include section headers", () => {
      const analytics = createMockAnalytics();
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("Quality Metrics");
      expect(html).toContain("Expiring Soon");
      expect(html).toContain("Deal Volume Over Time");
      expect(html).toContain("Category Distribution");
      expect(html).toContain("Value Distribution");
      expect(html).toContain("Source Performance");
    });

    it("should sort sources by dealsDiscovered descending", () => {
      const analytics = createMockAnalytics({
        sourcePerformance: [
          {
            domain: "small.com",
            dealsDiscovered: 5,
            dealsPublished: 3,
            avgConfidence: 0.7,
            trustScore: 0.6,
          },
          {
            domain: "large.com",
            dealsDiscovered: 50,
            dealsPublished: 40,
            avgConfidence: 0.8,
            trustScore: 0.9,
          },
        ],
      });
      const html = generateDashboardHTML(analytics);
      const largeIndex = html.indexOf("large.com");
      const smallIndex = html.indexOf("small.com");
      expect(largeIndex).toBeLessThan(smallIndex);
    });

    it("should handle large deal counts", () => {
      const analytics = createMockAnalytics({
        dealsOverTime: Array.from({ length: 30 }, (_, i) => ({
          date: `2024-03-${String(i + 1).padStart(2, "0")}`,
          discovered: 100 + i * 10,
          published: 80 + i * 8,
          expired: 5 + i,
        })),
      });
      const html = generateDashboardHTML(analytics);
      expect(html).toContain("2024-03-01");
      expect(html).toContain("2024-03-30");
    });
  });
});
