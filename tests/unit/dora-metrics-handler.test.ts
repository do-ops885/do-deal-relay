import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDORAMetrics } from "../../worker/routes/core/dora-metrics";
import type { Env } from "../../worker/types";

const { mockComputeDORAMetrics, mockGetDORASummary } = vi.hoisted(() => ({
  mockComputeDORAMetrics: vi.fn(),
  mockGetDORASummary: vi.fn(),
}));

vi.mock("../../worker/lib/metrics/dora", () => ({
  computeDORAMetrics: mockComputeDORAMetrics,
  getDORASummary: mockGetDORASummary,
}));

function createMockEnv(): Env {
  return {
    DEALS_PROD: {} as unknown as KVNamespace,
    DEALS_STAGING: {} as unknown as KVNamespace,
    DEALS_LOG: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    } as unknown as KVNamespace,
    DEALS_LOCK: {} as unknown as KVNamespace,
    DEALS_SOURCES: {} as unknown as KVNamespace,
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    EMAIL_WEBHOOK_SECRET: "test-email-secret",
    DEALS_DB: {} as any,
    TRUST_THRESHOLD: "0.3",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    GITHUB_TOKEN: "test-token",
    NOTIFICATION_THRESHOLD: "100",
  } as unknown as Env;
}

const MOCK_RESULT = {
  summary: {
    deployment_frequency: {
      runs_per_day: 3.5,
      successful_runs_per_day: 3.0,
      total_runs_in_period: 35,
      period_days: 10,
    },
    lead_time: {
      avg_duration_ms: 4200,
      p50_duration_ms: 3800,
      p95_duration_ms: 9200,
      p99_duration_ms: 15000,
      sample_size: 30,
    },
    change_failure_rate: {
      failure_rate: 0.1429,
      total_runs: 35,
      failed_runs: 5,
    },
    mean_time_to_recovery: {
      avg_recovery_ms: 120000,
      recovery_samples: 3,
    },
    computed_at: "2026-08-01T10:00:00.000Z",
    period_days: 10,
  },
  daily_breakdown: [
    {
      date: "2026-08-01",
      total_runs: 5,
      successful_runs: 4,
      failed_runs: 1,
      avg_duration_ms: 4100,
    },
  ],
};

function createRequest(url: string): Request {
  return new Request(url, {
    headers: { "Content-Type": "application/json" },
  });
}

describe("handleDORAMetrics", () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
    mockComputeDORAMetrics.mockReset();
    mockGetDORASummary.mockReset();
  });

  describe("query parameters - days", () => {
    it("should default to 30 days when no days parameter is provided", async () => {
      mockGetDORASummary.mockResolvedValue(MOCK_RESULT);

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockGetDORASummary).toHaveBeenCalledWith(env);
    });

    it("should pass days to computeDORAMetrics when bypass_cache is true", async () => {
      mockComputeDORAMetrics.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?days=7&bypass_cache=true",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockComputeDORAMetrics).toHaveBeenCalledWith(env, 7);
    });

    it("should clamp days to minimum of 1", async () => {
      mockComputeDORAMetrics.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?days=0&bypass_cache=true",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockComputeDORAMetrics).toHaveBeenCalledWith(env, 1);
    });

    it("should clamp days to maximum of 365", async () => {
      mockComputeDORAMetrics.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?days=400&bypass_cache=true",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockComputeDORAMetrics).toHaveBeenCalledWith(env, 365);
    });

    it("should clamp non-numeric days to 1", async () => {
      mockComputeDORAMetrics.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?days=abc&bypass_cache=true",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockComputeDORAMetrics).toHaveBeenCalledWith(env, 1);
    });

    it("should clamp literal NaN string to 1", async () => {
      mockComputeDORAMetrics.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?days=NaN&bypass_cache=true",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockComputeDORAMetrics).toHaveBeenCalledWith(env, 1);
    });

    it("should handle negative days by clamping to 1", async () => {
      mockComputeDORAMetrics.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?days=-5&bypass_cache=true",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockComputeDORAMetrics).toHaveBeenCalledWith(env, 1);
    });
  });

  describe("query parameters - bypass_cache", () => {
    it("should use cache (getDORASummary) when bypass_cache is not set", async () => {
      mockGetDORASummary.mockResolvedValue(MOCK_RESULT);

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockGetDORASummary).toHaveBeenCalledWith(env);
      expect(mockComputeDORAMetrics).not.toHaveBeenCalled();
    });

    it("should bypass cache when bypass_cache is true", async () => {
      mockComputeDORAMetrics.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?bypass_cache=true",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockComputeDORAMetrics).toHaveBeenCalledWith(env, 30);
      expect(mockGetDORASummary).not.toHaveBeenCalled();
    });

    it("should use cache when bypass_cache is false", async () => {
      mockGetDORASummary.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?bypass_cache=false",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockGetDORASummary).toHaveBeenCalledWith(env);
      expect(mockComputeDORAMetrics).not.toHaveBeenCalled();
    });

    it("should use cache when bypass_cache is any value other than true", async () => {
      mockGetDORASummary.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?bypass_cache=maybe",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockGetDORASummary).toHaveBeenCalledWith(env);
    });

    it("should combine bypass_cache with custom days", async () => {
      mockComputeDORAMetrics.mockResolvedValue(MOCK_RESULT);

      const url = new URL(
        "https://api.example.com/api/dora-metrics?days=14&bypass_cache=true",
      );
      const request = createRequest(url.toString());
      await handleDORAMetrics(url, env, request);

      expect(mockComputeDORAMetrics).toHaveBeenCalledWith(env, 14);
    });
  });

  describe("response shape", () => {
    it("should return 200 with correct DORA metrics body", async () => {
      mockGetDORASummary.mockResolvedValue(MOCK_RESULT);

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      const response = await handleDORAMetrics(url, env, request);

      expect(response.status).toBe(200);
      const body = (await response.json()) as typeof MOCK_RESULT;
      expect(body.summary).toBeDefined();
      expect(body.summary.deployment_frequency.runs_per_day).toBe(3.5);
      expect(body.summary.lead_time.avg_duration_ms).toBe(4200);
      expect(body.summary.change_failure_rate.failure_rate).toBe(0.1429);
      expect(body.summary.mean_time_to_recovery.avg_recovery_ms).toBe(120000);
      expect(body.summary.period_days).toBe(10);
      expect(body.daily_breakdown).toHaveLength(1);
    });

    it("should return application/json content type", async () => {
      mockGetDORASummary.mockResolvedValue(MOCK_RESULT);

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      const response = await handleDORAMetrics(url, env, request);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("application/json");
    });

    it("should include security headers in response", async () => {
      mockGetDORASummary.mockResolvedValue(MOCK_RESULT);

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      const response = await handleDORAMetrics(url, env, request);

      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin",
      );
    });

    it("should return computed_at timestamp in the response", async () => {
      mockGetDORASummary.mockResolvedValue(MOCK_RESULT);

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      const response = await handleDORAMetrics(url, env, request);

      const body = (await response.json()) as typeof MOCK_RESULT;
      expect(body.summary.computed_at).toBe("2026-08-01T10:00:00.000Z");
    });

    it("should return daily_breakdown as an array", async () => {
      mockGetDORASummary.mockResolvedValue(MOCK_RESULT);

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      const response = await handleDORAMetrics(url, env, request);

      const body = (await response.json()) as typeof MOCK_RESULT;
      expect(Array.isArray(body.daily_breakdown)).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should return 500 when computeDORAMetrics throws", async () => {
      mockComputeDORAMetrics.mockRejectedValue(new Error("KV error"));

      const url = new URL(
        "https://api.example.com/api/dora-metrics?bypass_cache=true",
      );
      const request = createRequest(url.toString());
      const response = await handleDORAMetrics(url, env, request);

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Failed to compute DORA metrics");
    });

    it("should return 500 when getDORASummary throws", async () => {
      mockGetDORASummary.mockRejectedValue(new Error("Cache error"));

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      const response = await handleDORAMetrics(url, env, request);

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Failed to compute DORA metrics");
    });

    it("should return JSON error body on failure", async () => {
      mockGetDORASummary.mockRejectedValue(new Error("Boom"));

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      const response = await handleDORAMetrics(url, env, request);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("application/json");
    });

    it("should handle non-Error thrown values gracefully", async () => {
      mockGetDORASummary.mockRejectedValue("raw string error");

      const url = new URL("https://api.example.com/api/dora-metrics");
      const request = createRequest(url.toString());
      const response = await handleDORAMetrics(url, env, request);

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Failed to compute DORA metrics");
    });
  });
});
