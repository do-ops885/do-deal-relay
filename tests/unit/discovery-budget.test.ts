import { describe, it, expect } from "vitest";
import {
  calculateAdaptiveBudget,
  DISCOVERY_CONSTANTS,
} from "../../worker/pipeline/discovery-budget";
import { SourceConfig } from "../../worker/types";

describe("discovery-budget", () => {
  const baseSource: SourceConfig = {
    domain: "example.com",
    url_patterns: [],
    trust_initial: 0.5,
    active: true,
    classification: "trusted",
    discovery_count: 0,
    validation_success_count: 0,
    validation_failure_count: 0,
  };

  it("should return base budget for neutral source", () => {
    const budget = calculateAdaptiveBudget(baseSource, 100, 50);
    expect(budget).toBe(100);
  });

  it("should add high trust bonus", () => {
    const highTrustSource = { ...baseSource, trust_initial: 0.9 };
    const budget = calculateAdaptiveBudget(highTrustSource, 100, 50);
    expect(budget).toBe(150);
  });

  it("should add bonus for high validation success rate", () => {
    const successfulSource = {
      ...baseSource,
      validation_success_count: 90,
      validation_failure_count: 10,
    };
    // successRate = 0.9 >= 0.8 (HIGH)
    // 100 + (100 * 0.5) = 150
    const budget = calculateAdaptiveBudget(successfulSource, 100, 50);
    expect(budget).toBe(150);
  });

  it("should add bonus for medium validation success rate", () => {
    const mediumSource = {
      ...baseSource,
      validation_success_count: 60,
      validation_failure_count: 40,
    };
    // successRate = 0.6 >= 0.5 (MEDIUM)
    // 100 + (100 * 0.25) = 125
    const budget = calculateAdaptiveBudget(mediumSource, 100, 50);
    expect(budget).toBe(125);
  });

  it("should apply penalty for low validation success rate", () => {
    const failingSource = {
      ...baseSource,
      validation_success_count: 20,
      validation_failure_count: 80,
    };
    // successRate = 0.2 < 0.5
    // 100 * 0.75 = 75
    const budget = calculateAdaptiveBudget(failingSource, 100, 50);
    expect(budget).toBe(75);
  });

  it("should add maturity bonus for high discovery count", () => {
    const matureSource = {
      ...baseSource,
      discovery_count: 20,
    };
    // discoveryCount = 20 >= 10 (HIGH)
    // 100 + (100 * 0.2) = 120
    const budget = calculateAdaptiveBudget(matureSource, 100, 50);
    expect(budget).toBe(120);
  });

  it("should combine multiple bonuses", () => {
    const eliteSource = {
      ...baseSource,
      trust_initial: 0.9,
      validation_success_count: 100,
      discovery_count: 50,
    };
    // Base: 100
    // Trust: +50 -> 150
    // Success: +50 -> 200
    // Maturity: +20 -> 220
    const budget = calculateAdaptiveBudget(eliteSource, 100, 50);
    expect(budget).toBe(220);
  });
});
