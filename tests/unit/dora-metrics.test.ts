import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeDORAMetrics,
  getDORASummary,
  getMetricsIndex,
} from "../../worker/lib/metrics/dora";
import type { PipelineMetrics, Env } from "../../worker/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function createMockMetrics(
  runId: string,
  overrides: Partial<PipelineMetrics> = {},
): PipelineMetrics {
  const now = Date.now();
  return {
    run_id: runId,
    start_time: overrides.start_time ?? now - 5000,
    end_time: overrides.end_time ?? now,
    total_duration_ms: overrides.total_duration_ms ?? 5000,
    success: overrides.success ?? true,
    final_phase: overrides.final_phase ?? "publish",
    phase_timings: {
      init: 0,
      discover: 0,
      normalize: 0,
      dedupe: 0,
      validate: 0,
      score: 0,
      stage: 0,
      publish: 0,
      verify: 0,
      finalize: 0,
    },
    phase_results: {
      init: "success",
      discover: "success",
      normalize: "success",
      dedupe: "success",
      validate: "success",
      score: "success",
      stage: "success",
      publish: "success",
      verify: "success",
      finalize: "success",
    },
    deals_processed: {
      discovered: 100,
      passed_trust_filter: 80,
      normalized: 70,
      deduped: 60,
      validated: 50,
      scored: 40,
      published: 30,
    },
    errors: 0,
    retries: 0,
    ...overrides,
  };
}

function createMockEnv(kvStore: Map<string, string>): Env {
  return {
    DEALS_PROD: {} as unknown as KVNamespace,
    DEALS_STAGING: {} as unknown as KVNamespace,
    DEALS_LOG: {
      get: vi.fn(async (key: string) => {
        const value = kvStore.get(key);
        return value !== undefined ? value : null;
      }),
      put: vi.fn(async (key: string, value: string) => {
        kvStore.set(key, value);
      }),
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

function seedKv(
  kvStore: Map<string, string>,
  metrics: PipelineMetrics[],
): void {
  const runIds = metrics.map((m) => m.run_id);
  kvStore.set("metrics:index", JSON.stringify(runIds));
  for (const m of metrics) {
    kvStore.set(`metrics:${m.run_id}`, JSON.stringify(m));
  }
}

describe("DORA Metrics", () => {
  let kvStore: Map<string, string>;
  let env: Env;

  beforeEach(() => {
    kvStore = new Map();
    env = createMockEnv(kvStore);
  });

  describe("getMetricsIndex", () => {
    it("should return empty array when no index exists", async () => {
      const result = await getMetricsIndex(env);
      expect(result).toEqual([]);
    });

    it("should return parsed index when present", async () => {
      kvStore.set("metrics:index", JSON.stringify(["run-a", "run-b"]));
      const result = await getMetricsIndex(env);
      expect(result).toEqual(["run-a", "run-b"]);
    });
  });

  describe("computeDORAMetrics - deployment frequency", () => {
    it("should return zeros when no metrics exist", async () => {
      seedKv(kvStore, []);
      const result = await computeDORAMetrics(env, 7);

      const df = result.summary.deployment_frequency;
      expect(df.runs_per_day).toBe(0);
      expect(df.successful_runs_per_day).toBe(0);
      expect(df.total_runs_in_period).toBe(0);
      expect(df.period_days).toBe(7);
    });

    it("should compute runs per day for all-successful metrics", async () => {
      const metrics = [
        createMockMetrics("r1", { success: true }),
        createMockMetrics("r2", { success: true }),
        createMockMetrics("r3", { success: true }),
        createMockMetrics("r4", { success: true }),
      ];
      seedKv(kvStore, metrics);

      const result = await computeDORAMetrics(env, 2);

      const df = result.summary.deployment_frequency;
      expect(df.runs_per_day).toBe(2);
      expect(df.successful_runs_per_day).toBe(2);
      expect(df.total_runs_in_period).toBe(4);
      expect(df.period_days).toBe(2);
    });

    it("should separate successful from total runs per day", async () => {
      const metrics = [
        createMockMetrics("r1", { success: true }),
        createMockMetrics("r2", { success: false }),
        createMockMetrics("r3", { success: true }),
        createMockMetrics("r4", { success: false }),
        createMockMetrics("r5", { success: true }),
      ];
      seedKv(kvStore, metrics);

      const result = await computeDORAMetrics(env, 5);

      const df = result.summary.deployment_frequency;
      expect(df.runs_per_day).toBe(1);
      expect(df.successful_runs_per_day).toBe(0.6);
      expect(df.total_runs_in_period).toBe(5);
    });

    it("should handle days parameter of 0 gracefully", async () => {
      seedKv(kvStore, [createMockMetrics("r1")]);
      const result = await computeDORAMetrics(env, 0);

      const df = result.summary.deployment_frequency;
      expect(df.runs_per_day).toBe(0);
      expect(df.successful_runs_per_day).toBe(0);
      expect(df.period_days).toBe(0);
    });
  });

  describe("computeDORAMetrics - lead time", () => {
    it("should return zeros when no metrics exist", async () => {
      seedKv(kvStore, []);
      const result = await computeDORAMetrics(env, 7);

      const lt = result.summary.lead_time;
      expect(lt.avg_duration_ms).toBe(0);
      expect(lt.p50_duration_ms).toBe(0);
      expect(lt.p95_duration_ms).toBe(0);
      expect(lt.p99_duration_ms).toBe(0);
      expect(lt.sample_size).toBe(0);
    });

    it("should compute correct average for a single run", async () => {
      seedKv(kvStore, [createMockMetrics("r1", { total_duration_ms: 4200 })]);
      const result = await computeDORAMetrics(env, 30);

      const lt = result.summary.lead_time;
      expect(lt.avg_duration_ms).toBe(4200);
      expect(lt.sample_size).toBe(1);
    });

    it("should compute correct quantiles for multiple runs", async () => {
      seedKv(kvStore, [
        createMockMetrics("r1", { total_duration_ms: 1000 }),
        createMockMetrics("r2", { total_duration_ms: 2000 }),
        createMockMetrics("r3", { total_duration_ms: 3000 }),
        createMockMetrics("r4", { total_duration_ms: 4000 }),
        createMockMetrics("r5", { total_duration_ms: 5000 }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const lt = result.summary.lead_time;
      expect(lt.avg_duration_ms).toBe(3000);
      expect(lt.p50_duration_ms).toBe(3000);
      expect(lt.p95_duration_ms).toBe(5000);
      expect(lt.p99_duration_ms).toBe(5000);
      expect(lt.sample_size).toBe(5);
    });

    it("should filter out zero-duration metrics from lead time", async () => {
      seedKv(kvStore, [
        createMockMetrics("r1", { total_duration_ms: 3000 }),
        createMockMetrics("r2", { total_duration_ms: 0 }),
        createMockMetrics("r3", { total_duration_ms: 1000 }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const lt = result.summary.lead_time;
      expect(lt.sample_size).toBe(2);
      expect(lt.avg_duration_ms).toBe(2000);
    });

    it("should handle p99 quantile for exactly 100 items", async () => {
      const metrics = Array.from({ length: 100 }, (_, i) =>
        createMockMetrics(`r${i}`, {
          total_duration_ms: (i + 1) * 100,
        }),
      );
      seedKv(kvStore, metrics);
      const result = await computeDORAMetrics(env, 30);

      const lt = result.summary.lead_time;
      expect(lt.p99_duration_ms).toBe(9900);
      expect(lt.p50_duration_ms).toBe(5000);
    });
  });

  describe("computeDORAMetrics - change failure rate", () => {
    it("should return zero when no runs exist", async () => {
      seedKv(kvStore, []);
      const result = await computeDORAMetrics(env, 7);

      const cfr = result.summary.change_failure_rate;
      expect(cfr.failure_rate).toBe(0);
      expect(cfr.total_runs).toBe(0);
      expect(cfr.failed_runs).toBe(0);
    });

    it("should return zero failure rate when all succeed", async () => {
      seedKv(kvStore, [
        createMockMetrics("r1", { success: true }),
        createMockMetrics("r2", { success: true }),
        createMockMetrics("r3", { success: true }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const cfr = result.summary.change_failure_rate;
      expect(cfr.failure_rate).toBe(0);
      expect(cfr.total_runs).toBe(3);
      expect(cfr.failed_runs).toBe(0);
    });

    it("should compute correct failure rate for mixed outcomes", async () => {
      seedKv(kvStore, [
        createMockMetrics("r1", { success: true }),
        createMockMetrics("r2", { success: false }),
        createMockMetrics("r3", { success: false }),
        createMockMetrics("r4", { success: true }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const cfr = result.summary.change_failure_rate;
      expect(cfr.failure_rate).toBe(0.5);
      expect(cfr.total_runs).toBe(4);
      expect(cfr.failed_runs).toBe(2);
    });

    it("should return failure rate of 1 when all fail", async () => {
      seedKv(kvStore, [
        createMockMetrics("r1", { success: false }),
        createMockMetrics("r2", { success: false }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const cfr = result.summary.change_failure_rate;
      expect(cfr.failure_rate).toBe(1);
      expect(cfr.failed_runs).toBe(2);
    });
  });

  describe("computeDORAMetrics - MTTR", () => {
    it("should return zeros when no metrics exist", async () => {
      seedKv(kvStore, []);
      const result = await computeDORAMetrics(env, 7);

      const mttr = result.summary.mean_time_to_recovery;
      expect(mttr.avg_recovery_ms).toBe(0);
      expect(mttr.recovery_samples).toBe(0);
    });

    it("should return zeros when there are no failures", async () => {
      seedKv(kvStore, [
        createMockMetrics("r1", { success: true }),
        createMockMetrics("r2", { success: true }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const mttr = result.summary.mean_time_to_recovery;
      expect(mttr.avg_recovery_ms).toBe(0);
      expect(mttr.recovery_samples).toBe(0);
    });

    it("should compute recovery time from failure to next success", async () => {
      const now = Date.now();
      seedKv(kvStore, [
        createMockMetrics("r1", {
          success: false,
          start_time: now - 10000,
          end_time: now - 8000,
        }),
        createMockMetrics("r2", {
          success: true,
          start_time: now - 3000,
          end_time: now,
        }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const mttr = result.summary.mean_time_to_recovery;
      // Recovery from r1 failure end (now-8000) to r2 success start (now-3000) = 5000ms
      expect(mttr.avg_recovery_ms).toBe(5000);
      expect(mttr.recovery_samples).toBe(1);
    });

    it("should not count failure without a subsequent success", async () => {
      const now = Date.now();
      seedKv(kvStore, [
        createMockMetrics("r1", {
          success: false,
          start_time: now - 10000,
          end_time: now - 8000,
        }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const mttr = result.summary.mean_time_to_recovery;
      expect(mttr.avg_recovery_ms).toBe(0);
      expect(mttr.recovery_samples).toBe(0);
    });

    it("should compute average across multiple failure-recovery pairs", async () => {
      const now = Date.now();
      seedKv(kvStore, [
        createMockMetrics("r1", {
          success: false,
          start_time: now - 100000,
          end_time: now - 95000,
        }),
        createMockMetrics("r2", {
          success: true,
          start_time: now - 85000,
          end_time: now - 80000,
        }),
        createMockMetrics("r3", {
          success: false,
          start_time: now - 50000,
          end_time: now - 45000,
        }),
        createMockMetrics("r4", {
          success: true,
          start_time: now - 35000,
          end_time: now - 30000,
        }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const mttr = result.summary.mean_time_to_recovery;
      // recovery 1: 95000 → 85000 = 10000ms, recovery 2: 45000 → 35000 = 10000ms
      expect(mttr.avg_recovery_ms).toBe(10000);
      expect(mttr.recovery_samples).toBe(2);
    });

    it("should use end_time as failure time, falling back to start_time", async () => {
      const now = Date.now();
      seedKv(kvStore, [
        createMockMetrics("r1", {
          success: false,
          start_time: now - 10000,
          end_time: undefined,
        }),
        createMockMetrics("r2", {
          success: true,
          start_time: now - 3000,
          end_time: now,
        }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      const mttr = result.summary.mean_time_to_recovery;
      // Recovery from r1 start_time (now-10000) to r2 start_time (now-3000) = 7000ms
      expect(mttr.avg_recovery_ms).toBe(7000);
      expect(mttr.recovery_samples).toBe(1);
    });
  });

  describe("computeDORAMetrics - daily breakdown", () => {
    it("should return empty breakdown when no metrics exist", async () => {
      seedKv(kvStore, []);
      const result = await computeDORAMetrics(env, 7);

      expect(result.daily_breakdown).toEqual([]);
    });

    it("should group metrics by date with correct counts", async () => {
      const today = new Date();
      const yesterday = new Date(today.getTime() - DAY_MS);

      seedKv(kvStore, [
        createMockMetrics("r1", {
          success: true,
          start_time: today.getTime(),
          total_duration_ms: 2000,
        }),
        createMockMetrics("r2", {
          success: false,
          start_time: today.getTime(),
          total_duration_ms: 4000,
        }),
        createMockMetrics("r3", {
          success: true,
          start_time: yesterday.getTime(),
          total_duration_ms: 3000,
        }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      expect(result.daily_breakdown).toHaveLength(2);

      const firstDay = result.daily_breakdown[0];
      expect(firstDay).toBeDefined();
      if (firstDay) {
        expect(firstDay.date).toBe(yesterday.toISOString().slice(0, 10));
        expect(firstDay.total_runs).toBe(1);
        expect(firstDay.successful_runs).toBe(1);
        expect(firstDay.failed_runs).toBe(0);
        expect(firstDay.avg_duration_ms).toBe(3000);
      }

      const secondDay = result.daily_breakdown[1];
      expect(secondDay).toBeDefined();
      if (secondDay) {
        expect(secondDay.date).toBe(today.toISOString().slice(0, 10));
        expect(secondDay.total_runs).toBe(2);
        expect(secondDay.successful_runs).toBe(1);
        expect(secondDay.failed_runs).toBe(1);
        expect(secondDay.avg_duration_ms).toBe(3000);
      }
    });

    it("should sort breakdown by date ascending", async () => {
      const now = Date.now();
      const day1 = new Date(now - 2 * DAY_MS);
      const day2 = new Date(now - 1 * DAY_MS);
      const day3 = new Date(now);

      seedKv(kvStore, [
        createMockMetrics("r1", { start_time: day3.getTime() }),
        createMockMetrics("r2", { start_time: day1.getTime() }),
        createMockMetrics("r3", { start_time: day2.getTime() }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      expect(result.daily_breakdown).toHaveLength(3);
      const dates = result.daily_breakdown.map((d) => d.date);
      expect(dates).toEqual([
        day1.toISOString().slice(0, 10),
        day2.toISOString().slice(0, 10),
        day3.toISOString().slice(0, 10),
      ]);
    });

    it("should handle empty-day edge case with zero duration", async () => {
      const now = Date.now();
      seedKv(kvStore, [
        createMockMetrics("r1", {
          start_time: now,
          total_duration_ms: 0,
          success: true,
        }),
      ]);
      const result = await computeDORAMetrics(env, 30);

      expect(result.daily_breakdown).toHaveLength(1);
      const day = result.daily_breakdown[0];
      expect(day).toBeDefined();
      if (day) {
        expect(day.avg_duration_ms).toBe(0);
        expect(day.total_runs).toBe(1);
      }
    });
  });

  describe("computeDORAMetrics - 30-day default window", () => {
    it("should use 30 days as default when days parameter is omitted", async () => {
      seedKv(kvStore, [createMockMetrics("r1")]);
      const result = await computeDORAMetrics(env);

      expect(result.summary.period_days).toBe(30);
    });

    it("should filter out metrics older than the specified window", async () => {
      const now = Date.now();
      const oldMetric = createMockMetrics("r-old", {
        start_time: now - 40 * DAY_MS,
      });
      const recentMetric = createMockMetrics("r-recent", {
        start_time: now - 5 * DAY_MS,
      });

      seedKv(kvStore, [oldMetric, recentMetric]);
      const result = await computeDORAMetrics(env, 7);

      expect(result.summary.deployment_frequency.total_runs_in_period).toBe(1);
      expect(result.daily_breakdown).toHaveLength(1);
    });
  });

  describe("computeDORAMetrics - full integrated result", () => {
    it("should produce a complete DORAMetricsResult with all fields", async () => {
      const now = Date.now();
      seedKv(kvStore, [
        createMockMetrics("r-fail", {
          success: false,
          start_time: now - 10000,
          end_time: now - 8000,
          total_duration_ms: 2000,
        }),
        createMockMetrics("r-success", {
          success: true,
          start_time: now - 3000,
          end_time: now,
          total_duration_ms: 3000,
        }),
      ]);

      const result = await computeDORAMetrics(env, 1);

      expect(result.summary.computed_at).toBeTruthy();
      expect(result.summary.period_days).toBe(1);
      expect(result.summary.deployment_frequency.total_runs_in_period).toBe(2);
      expect(result.summary.deployment_frequency.runs_per_day).toBe(2);
      expect(result.summary.lead_time.sample_size).toBe(2);
      expect(result.summary.lead_time.avg_duration_ms).toBe(2500);
      expect(result.summary.change_failure_rate.failure_rate).toBe(0.5);
      expect(result.summary.change_failure_rate.failed_runs).toBe(1);
      expect(result.summary.mean_time_to_recovery.recovery_samples).toBe(1);
      expect(result.summary.mean_time_to_recovery.avg_recovery_ms).toBe(5000);
      expect(result.daily_breakdown).toHaveLength(1);
    });
  });

  describe("getDORASummary - cache behavior", () => {
    it("should compute and cache when no cache exists", async () => {
      seedKv(kvStore, [createMockMetrics("r1")]);
      await getDORASummary(env);

      const putCalls = (
        env.DEALS_LOG.put as unknown as ReturnType<typeof vi.fn>
      ).mock.calls as [string, string][];
      const cachePut = putCalls.find((call) => call[0] === "dora:summary");
      expect(cachePut).toBeDefined();
      if (cachePut) {
        const cached = JSON.parse(cachePut[1]);
        expect(cached.summary.period_days).toBe(30);
      }
    });

    it("should return cached result without recomputing when cache exists", async () => {
      const cachedResult = {
        summary: {
          deployment_frequency: {
            runs_per_day: 99,
            successful_runs_per_day: 99,
            total_runs_in_period: 99,
            period_days: 30,
          },
          lead_time: {
            avg_duration_ms: 0,
            p50_duration_ms: 0,
            p95_duration_ms: 0,
            p99_duration_ms: 0,
            sample_size: 0,
          },
          change_failure_rate: {
            failure_rate: 0,
            total_runs: 0,
            failed_runs: 0,
          },
          mean_time_to_recovery: {
            avg_recovery_ms: 0,
            recovery_samples: 0,
          },
          computed_at: new Date().toISOString(),
          period_days: 30,
        },
        daily_breakdown: [],
      };
      kvStore.set("dora:summary", JSON.stringify(cachedResult));

      // Also seed metrics:index that would contradict the cache
      seedKv(kvStore, [createMockMetrics("r1")]);

      const result = await getDORASummary(env);

      // Assert cache was returned (99 runs_per_day), not recomputed (1 run)
      expect(result.summary.deployment_frequency.runs_per_day).toBe(99);
    });

    it("should gracefully handle cache write failures", async () => {
      seedKv(kvStore, [createMockMetrics("r1")]);
      const failingEnv = createMockEnv(kvStore);
      (
        failingEnv.DEALS_LOG.put as unknown as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("KV write failed"));

      // Should still return computed result despite cache write failure
      const result = await getDORASummary(failingEnv);
      expect(result.summary.period_days).toBe(30);
    });
  });
});
