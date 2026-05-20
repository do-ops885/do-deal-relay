import { describe, it, expect, vi } from "vitest";
import { handleMetrics } from "../../worker/routes/core/health";
import { Env, PipelineMetrics } from "../../worker/types";

describe("Funnel Metrics", () => {
  it("should calculate funnel metrics correctly in handleMetrics JSON response", async () => {
    // Mock Env
    const env = {
      DEALS_PROD: { get: vi.fn() },
      DEALS_LOG: {
        get: vi.fn().mockImplementation((key) => {
          if (key === "metrics:index") return JSON.stringify(["run-1"]);
          if (key === "metrics:run-1") return JSON.stringify(mockMetric);
          return null;
        }),
      },
      DEALS_LOCK: { get: vi.fn(), put: vi.fn() },
      DEALS_STAGING: { get: vi.fn() },
      DEALS_SOURCES: { get: vi.fn() },
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      AI_GATEWAY_URL: "https://ai.gateway",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      DEALS_DB: {} as any,
      TRUST_THRESHOLD: "0.3",
    } as unknown as Env;

    const mockMetric: PipelineMetrics = {
      run_id: "run-1",
      start_time: Date.now(),
      phase_timings: {} as any,
      phase_results: {} as any,
      total_duration_ms: 1000,
      deals_processed: {
        discovered: 100,
        passed_trust_filter: 60,
        normalized: 50,
        deduped: 40,
        validated: 30,
        scored: 25,
        published: 20,
      },
      errors: 0,
      retries: 0,
      success: true,
      final_phase: "finalize",
    };

    const request = new Request("https://worker.com/metrics?format=json");
    const response = await handleMetrics(env, "json", request);
    const data = (await response.json()) as {
      funnel: {
        discovered: number;
        passed_trust_filter: number;
        passed_all_validation: number;
        published: number;
        conversion_rate: string;
      };
    };

    expect(data.funnel).toBeDefined();
    expect(data.funnel.discovered).toBe(100);
    expect(data.funnel.passed_trust_filter).toBe(60);
    expect(data.funnel.passed_all_validation).toBe(30);
    expect(data.funnel.published).toBe(20);
    expect(data.funnel.conversion_rate).toBe("20.0%");
  });

  it("should fallback to aggregate stats when no latest run is available", async () => {
    // Mock Env with empty metrics
    const env = {
      DEALS_PROD: { get: vi.fn() },
      DEALS_LOG: {
        get: vi.fn().mockImplementation((key) => {
          if (key === "metrics:index") return JSON.stringify([]);
          return null;
        }),
      },
      DEALS_LOCK: { get: vi.fn(), put: vi.fn() },
      DEALS_STAGING: { get: vi.fn() },
      DEALS_SOURCES: { get: vi.fn() },
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      AI_GATEWAY_URL: "https://ai.gateway",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      DEALS_DB: {} as any,
      TRUST_THRESHOLD: "0.3",
    } as unknown as Env;

    const request = new Request("https://worker.com/metrics?format=json");
    const response = await handleMetrics(env, "json", request);
    const data = (await response.json()) as {
      funnel: {
        discovered: number;
        passed_trust_filter: number;
        passed_all_validation: number;
        published: number;
        conversion_rate: string;
      };
    };

    expect(data.funnel).toBeDefined();
    expect(data.funnel.discovered).toBe(0);
    expect(data.funnel.passed_trust_filter).toBe(0);
    expect(data.funnel.passed_all_validation).toBe(0);
    expect(data.funnel.published).toBe(0);
    expect(data.funnel.conversion_rate).toBe("0%");
  });

  it("should handle zero discovery in funnel math", async () => {
    const env = {
      DEALS_PROD: { get: vi.fn() },
      DEALS_LOG: {
        get: vi.fn().mockImplementation((key) => {
          if (key === "metrics:index") return JSON.stringify(["run-zero"]);
          if (key === "metrics:run-zero") return JSON.stringify(mockMetricZero);
          return null;
        }),
      },
      DEALS_LOCK: { get: vi.fn(), put: vi.fn() },
      DEALS_STAGING: { get: vi.fn() },
      DEALS_SOURCES: { get: vi.fn() },
      TRUST_THRESHOLD: "0.3",
    } as unknown as Env;

    const mockMetricZero: PipelineMetrics = {
      run_id: "run-zero",
      start_time: Date.now(),
      phase_timings: {} as any,
      phase_results: {} as any,
      total_duration_ms: 500,
      deals_processed: {
        discovered: 0,
        passed_trust_filter: 0,
        normalized: 0,
        deduped: 0,
        validated: 0,
        scored: 0,
        published: 0,
      },
      errors: 0,
      retries: 0,
      success: true,
      final_phase: "finalize",
    };

    const request = new Request("https://worker.com/metrics?format=json");
    const response = await handleMetrics(env, "json", request);
    const data = (await response.json()) as {
      funnel: {
        discovered: number;
        passed_trust_filter: number;
        passed_all_validation: number;
        published: number;
        conversion_rate: string;
      };
    };

    expect(data.funnel.conversion_rate).toBe("0%");
  });
});
