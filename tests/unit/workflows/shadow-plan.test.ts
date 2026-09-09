import { describe, it, expect } from "vitest";
import {
  buildShadowPlan,
  shadowStepName,
} from "../../../worker/workflows/shadow-plan";
import type { Env, SourceConfig } from "../../../worker/types";

const TEST_ENVIRONMENT = "test";
const TEST_TRUST_THRESHOLD = "0.3";
const RUN_ID = "run-1";

const HIGH_TRUST_SCORE = 0.9;
const MID_TRUST_SCORE = 0.5;
const OK_TRUST_SCORE = 0.4;
const LOW_TRUST_SCORE = 0.1;
const EXPECTED_BASE_BUDGET = 20;
const EXPECTED_HIGH_TRUST_BUDGET = 45;

function createSource(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    domain: "example.com",
    url_patterns: ["/referral"],
    trust_initial: MID_TRUST_SCORE,
    classification: "probationary",
    active: true,
    ...overrides,
  };
}

function createPlanEnv(sources: SourceConfig[]): Env {
  const store = new Map<string, unknown>([["registry", sources]]);
  return {
    DEALS_SOURCES: {
      get: async <T>(key: string): Promise<T | null> =>
        (store.get(key) as T | undefined) ?? null,
      put: async (key: string, value: string): Promise<void> => {
        store.set(key, JSON.parse(value) as unknown);
      },
      delete: async (key: string): Promise<void> => {
        store.delete(key);
      },
    } as unknown as KVNamespace,
    ENVIRONMENT: TEST_ENVIRONMENT,
    TRUST_THRESHOLD: TEST_TRUST_THRESHOLD,
  } as unknown as Env;
}

describe("shadowStepName", () => {
  it("should return deterministic names for the same inputs", (): void => {
    const first: string = shadowStepName("example.com", RUN_ID);
    const second: string = shadowStepName("example.com", RUN_ID);
    expect(first).toBe("discover-example-com-run-1");
    expect(second).toBe(first);
  });

  it("should sanitize characters outside letters digits and dashes", (): void => {
    expect(shadowStepName("exa mple.com/path", RUN_ID)).toBe(
      "discover-exa-mple-com-path-run-1",
    );
    expect(shadowStepName("a:b_c~d", RUN_ID)).toBe("discover-a-b-c-d-run-1");
  });

  it("should keep distinct inputs distinct", (): void => {
    expect(shadowStepName("a.com", RUN_ID)).not.toBe(
      shadowStepName("b.com", RUN_ID),
    );
    expect(shadowStepName("a.com", "r1")).not.toBe(
      shadowStepName("a.com", "r2"),
    );
  });
});

describe("buildShadowPlan", () => {
  it("should exclude inactive blocked and low-trust sources", async (): Promise<void> => {
    const sources: SourceConfig[] = [
      createSource({
        domain: "good.com",
        trust_initial: HIGH_TRUST_SCORE,
        classification: "trusted",
      }),
      createSource({ domain: "idle.com", active: false }),
      createSource({ domain: "evil.com", classification: "blocked" }),
      createSource({ domain: "weak.com", trust_initial: LOW_TRUST_SCORE }),
    ];
    const plan = await buildShadowPlan(createPlanEnv(sources), RUN_ID);
    expect(plan.run_id).toBe(RUN_ID);
    expect(plan.sources.map((entry) => entry.domain)).toEqual(["good.com"]);
  });

  it("should sort planned sources by trust descending", async (): Promise<void> => {
    const sources: SourceConfig[] = [
      createSource({ domain: "mid.com", trust_initial: MID_TRUST_SCORE }),
      createSource({
        domain: "top.com",
        trust_initial: HIGH_TRUST_SCORE,
        classification: "trusted",
      }),
      createSource({ domain: "ok.com", trust_initial: OK_TRUST_SCORE }),
    ];
    const plan = await buildShadowPlan(createPlanEnv(sources), RUN_ID);
    expect(plan.sources.map((entry) => entry.domain)).toEqual([
      "top.com",
      "mid.com",
      "ok.com",
    ]);
  });

  it("should apply adaptive limits with a high-trust bonus", async (): Promise<void> => {
    const sources: SourceConfig[] = [
      createSource({
        domain: "top.com",
        trust_initial: HIGH_TRUST_SCORE,
        classification: "trusted",
      }),
      createSource({ domain: "mid.com", trust_initial: MID_TRUST_SCORE }),
    ];
    const plan = await buildShadowPlan(createPlanEnv(sources), RUN_ID);
    expect(plan.sources).toEqual([
      { domain: "top.com", limit: EXPECTED_HIGH_TRUST_BUDGET },
      { domain: "mid.com", limit: EXPECTED_BASE_BUDGET },
    ]);
  });
});
