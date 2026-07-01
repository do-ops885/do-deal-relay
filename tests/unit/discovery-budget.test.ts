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

  // ========================================================================
  // Edge Case Tests
  // ========================================================================

  it("should NOT add trust bonus at exactly 0.7 (boundary)", () => {
    // HIGH_TRUST_THRESHOLD is 0.7; the check is strict greater-than (> 0.7)
    const boundarySource = { ...baseSource, trust_initial: 0.7 };
    const budget = calculateAdaptiveBudget(boundarySource, 100, 50);
    // 0.7 > 0.7 is false → no trust bonus
    // Base only: 100
    expect(budget).toBe(100);
  });

  it("should add trust bonus just above 0.7 threshold", () => {
    const justAboveSource = { ...baseSource, trust_initial: 0.71 };
    const budget = calculateAdaptiveBudget(justAboveSource, 100, 50);
    // 0.71 > 0.7 is true → +50
    expect(budget).toBe(150);
  });

  it("should return only highTrustBonus when perSourceBase is 0", () => {
    const anySource = {
      ...baseSource,
      trust_initial: 0.9,
      validation_success_count: 100,
      validation_failure_count: 0,
      discovery_count: 20,
    };
    // perSourceBase = 0 → base budget is 0
    // Trust: 0.9 > 0.7 → budget += 50 → 50 (trust bonus is flat, not scaled)
    // Validation: successRate = 1.0 >= 0.8 → round(0 * 0.5) = 0
    // Maturity: discovery_count 20 >= 10 → round(0 * 0.2) = 0
    const budget = calculateAdaptiveBudget(anySource, 0, 50);
    expect(budget).toBe(50);
  });

  it("should not add trust bonus when highTrustBonus is 0", () => {
    const highTrustSource = { ...baseSource, trust_initial: 0.9 };
    // highTrustBonus = 0 → trust check passes but adds nothing
    const budget = calculateAdaptiveBudget(highTrustSource, 100, 0);
    expect(budget).toBe(100);
  });

  it("should add 10% maturity bonus at MEDIUM threshold (count=5)", () => {
    const mediumMaturity = { ...baseSource, discovery_count: 5 };
    // MATURITY_THRESHOLD_MEDIUM = 5, BONUS_MATURITY_MEDIUM = 0.1
    // 5 >= 5 → +round(100 * 0.1) = +10
    const budget = calculateAdaptiveBudget(mediumMaturity, 100, 50);
    expect(budget).toBe(110);
  });

  it("should still add 10% bonus between MEDIUM and HIGH (count=8)", () => {
    const midMaturity = { ...baseSource, discovery_count: 8 };
    // 8 >= 5 (MEDIUM) but 8 < 10 (not HIGH)
    // +round(100 * 0.1) = +10
    const budget = calculateAdaptiveBudget(midMaturity, 100, 50);
    expect(budget).toBe(110);
  });

  it("should combine high trust bonus with low validation penalty", () => {
    const mixedSource = {
      ...baseSource,
      trust_initial: 0.9,
      validation_success_count: 20,
      validation_failure_count: 80,
    };
    // Base: 100
    // Trust: 0.9 > 0.7 → +50 → 150
    // Validation: successRate = 20/100 = 0.2 < 0.5 → penalty: round(150 * 0.75) = 113
    const budget = calculateAdaptiveBudget(mixedSource, 100, 50);
    expect(budget).toBe(113);
  });

  it("should return base budget for all-zeros source", () => {
    const zeroSource = {
      ...baseSource,
      trust_initial: 0,
      validation_success_count: 0,
      validation_failure_count: 0,
      discovery_count: 0,
    };
    // No trust bonus (0 > 0.7 is false)
    // No validation branch (totalValidations = 0)
    // No maturity bonus (0 >= 5 is false)
    // Budget = 100
    const budget = calculateAdaptiveBudget(zeroSource, 100, 50);
    expect(budget).toBe(100);
  });

  it("should NOT apply penalty when all validations are failures (successRate=0)", () => {
    const totalFailSource = {
      ...baseSource,
      validation_success_count: 0,
      validation_failure_count: 10,
    };
    // totalValidations = 10 > 0 → enters validation branch
    // successRate = 0/10 = 0
    // 0 < 0.5 but 0 > 0 is false → penalty guard blocks penalty
    // Budget stays at base: 100
    const budget = calculateAdaptiveBudget(totalFailSource, 100, 50);
    expect(budget).toBe(100);
  });

  it("should add high bonus for single validation success (successRate=1.0)", () => {
    const singleSuccess = {
      ...baseSource,
      validation_success_count: 1,
      validation_failure_count: 0,
    };
    // totalValidations = 1 > 0 → enters validation branch
    // successRate = 1/1 = 1.0 >= 0.8 (HIGH)
    // +round(100 * 0.5) = +50
    const budget = calculateAdaptiveBudget(singleSuccess, 100, 50);
    expect(budget).toBe(150);
  });
});
