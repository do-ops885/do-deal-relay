import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiscoveryShadowWorkflow } from "../../../worker/workflows/discovery-shadow";
import {
  buildShadowPlan,
  shadowStepName,
} from "../../../worker/workflows/shadow-plan";
import {
  discoverSourceReadonly,
  type ShadowSourceSummary,
} from "../../../worker/pipeline/discover";
import type { Env, SourceConfig } from "../../../worker/types";

vi.mock("../../../worker/workflows/shadow-plan", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../worker/workflows/shadow-plan")
    >();
  return { ...actual, buildShadowPlan: vi.fn() };
});

vi.mock("../../../worker/pipeline/discover", () => ({
  discoverSourceReadonly: vi.fn(),
  getDiscoveryBudgets: vi.fn(),
}));

const RUN_ID = "r1";
const GOOD_DOMAIN = "good.com";
const BAD_DOMAIN = "bad.com";
const GOOD_TRUST = 0.8;
const BAD_TRUST = 0.6;
const GOOD_DEAL_COUNT = 2;
const EXPECTED_SOURCE_COUNT = 2;
const READONLY_FAILURE = "readonly fetch failed";

type ShadowRunFn = typeof DiscoveryShadowWorkflow.prototype.run;
type ShadowRunEvent = Parameters<ShadowRunFn>[0];
type ShadowRunStep = Parameters<ShadowRunFn>[1];

const mockBuildShadowPlan = vi.mocked(buildShadowPlan);
const mockReadonly = vi.mocked(discoverSourceReadonly);

function createShadowEnv(): Env {
  const registry: SourceConfig[] = [
    {
      domain: GOOD_DOMAIN,
      url_patterns: ["/a"],
      trust_initial: GOOD_TRUST,
      classification: "trusted",
      active: true,
    },
    {
      domain: BAD_DOMAIN,
      url_patterns: ["/b"],
      trust_initial: BAD_TRUST,
      classification: "probationary",
      active: true,
    },
  ];
  const store = new Map<string, unknown>([["registry", registry]]);
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
  } as unknown as Env;
}

function setupPlanAndReadonly(): void {
  mockBuildShadowPlan.mockResolvedValue({
    run_id: RUN_ID,
    sources: [
      { domain: GOOD_DOMAIN, limit: 5 },
      { domain: BAD_DOMAIN, limit: 5 },
    ],
  });
  mockReadonly.mockImplementation(
    async (
      source: SourceConfig,
      _limit: number,
    ): Promise<ShadowSourceSummary> => {
      if (source.domain === GOOD_DOMAIN) {
        return {
          domain: GOOD_DOMAIN,
          deal_count: GOOD_DEAL_COUNT,
          error_count: 0,
          sample_codes: ["GOOD1", "GOOD2"],
          sample_errors: [],
        };
      }
      throw new Error(READONLY_FAILURE);
    },
  );
}

async function driveRun(): Promise<{
  names: string[];
  summary: Awaited<ReturnType<ShadowRunFn>>;
}> {
  const names: string[] = [];
  const stubStep = {
    do: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      names.push(name);
      return fn();
    },
  } as unknown as ShadowRunStep;
  const host = { env: createShadowEnv() } as unknown as DiscoveryShadowWorkflow;
  const event = { payload: { run_id: RUN_ID } } as unknown as ShadowRunEvent;
  const summary = await DiscoveryShadowWorkflow.prototype.run.call(
    host,
    event,
    stubStep,
  );
  return { names, summary };
}

describe("DiscoveryShadowWorkflow run", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
    setupPlanAndReadonly();
  });

  it("should use deterministic step names and aggregate per-source summaries", async (): Promise<void> => {
    const { names, summary } = await driveRun();

    expect(names).toEqual([
      `plan-${RUN_ID}`,
      shadowStepName(GOOD_DOMAIN, RUN_ID),
      shadowStepName(BAD_DOMAIN, RUN_ID),
    ]);
    expect(shadowStepName(GOOD_DOMAIN, RUN_ID)).toBe("discover-good-com-r1");
    expect(shadowStepName(BAD_DOMAIN, RUN_ID)).toBe("discover-bad-com-r1");
    expect(summary.run_id).toBe(RUN_ID);
    expect(summary.source_count).toBe(EXPECTED_SOURCE_COUNT);
    expect(summary.total_deals).toBe(GOOD_DEAL_COUNT);
    expect(summary.total_errors).toBe(1);
    expect(summary.sources).toHaveLength(EXPECTED_SOURCE_COUNT);
    expect(summary.sources[0]?.deal_count).toBe(GOOD_DEAL_COUNT);
  });

  it("should record a failing source instead of throwing", async (): Promise<void> => {
    const { summary } = await driveRun();

    const failed: ShadowSourceSummary | undefined = summary.sources[1];
    expect(failed?.domain).toBe(BAD_DOMAIN);
    expect(failed?.deal_count).toBe(0);
    expect(failed?.error_count).toBe(1);
    expect(failed?.sample_errors).toHaveLength(1);
    expect(failed?.sample_errors[0]).toContain(BAD_DOMAIN);
  });
});
