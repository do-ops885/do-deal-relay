import { describe, it, expect, vi } from "vitest";
import {
  getHealthStatus,
  HEALTH_MAX_RUNS,
  HEALTH_WINDOW_MS,
} from "../../worker/routes/core/health";
import type { Env } from "../../worker/types";
import type { PipelineMetrics } from "../../worker/types/pipeline";

const NOW = Date.now();

function createMetrics(
  runId: string,
  overrides: Partial<PipelineMetrics> = {},
): PipelineMetrics {
  return {
    run_id: runId,
    start_time: NOW - 1000,
    end_time: NOW - 500,
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
    total_duration_ms: 1000,
    deals_processed: {
      discovered: 10,
      passed_trust_filter: 8,
      normalized: 8,
      deduped: 8,
      validated: 6,
      scored: 6,
      published: 5,
    },
    errors: 0,
    retries: 0,
    success: true,
    final_phase: "finalize",
    ...overrides,
  };
}

function createKv(records: Record<string, string>) {
  const storage = new Map(Object.entries(records));
  return {
    get: vi.fn(async (key: string) => storage.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    list: vi.fn(async () => {
      throw new Error("health path must not list the KV namespace");
    }),
  };
}

function createEnv(
  options: {
    records?: Record<string, string>;
    snapshot?: boolean;
    d1Connected?: boolean;
    missingKv?: keyof Pick<
      Env,
      | "DEALS_PROD"
      | "DEALS_STAGING"
      | "DEALS_LOG"
      | "DEALS_LOCK"
      | "DEALS_SOURCES"
    >;
  } = {},
) {
  const kv = createKv(options.records ?? {});
  const db = {
    prepare: vi.fn((sql: string) => ({
      first: vi.fn(async () => {
        if (sql.includes("snapshot")) {
          return options.snapshot === false ? null : { snapshot_hash: "abc" };
        }
        if (options.d1Connected === false) {
          throw new Error("D1 unavailable");
        }
        return { 1: 1 };
      }),
    })),
  };

  const env = {
    DEALS_PROD: kv,
    DEALS_STAGING: kv,
    DEALS_LOG: kv,
    DEALS_LOCK: kv,
    DEALS_SOURCES: kv,
    DEALS_DB: db,
    ENVIRONMENT: "test",
  } as unknown as Env;

  if (options.missingKv) {
    delete (env as unknown as Record<string, unknown>)[options.missingKv];
  }

  return { env, kv, db };
}

async function readHealth(env: Env) {
  const response = await getHealthStatus(
    new Request("https://example.com/health"),
    env,
  );
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown> & {
      status: string;
      checks: Record<string, boolean>;
      components: {
        pipeline: {
          last_run: string;
          last_success: boolean;
          average_duration_ms: number;
        };
      };
      metrics: {
        total_runs_24h: number;
        success_rate_24h: number;
        avg_deals_per_run: number;
      };
      last_run?: {
        run_id: string;
        duration_ms: number;
        deals_count: number;
      };
    },
  };
}

describe("getHealthStatus", () => {
  it("reports healthy when snapshot and dependencies are valid and the last run succeeded", async () => {
    const run = createMetrics("run-1");
    const { env } = createEnv({
      records: {
        "metrics:index": JSON.stringify(["run-1"]),
        "metrics:run-1": JSON.stringify(run),
      },
    });

    const { body } = await readHealth(env);
    expect(body.status).toBe("healthy");
    expect(body.checks.snapshot_valid).toBe(true);
    expect(body.checks.last_run_success).toBe(true);
    expect(body.last_run?.run_id).toBe("run-1");
    expect(body.last_run?.deals_count).toBe(5);
    expect(body.metrics.avg_deals_per_run).toBe(5);
  });

  it("reports degraded when the snapshot is missing", async () => {
    const { env } = createEnv({
      snapshot: false,
      records: {
        "metrics:index": JSON.stringify(["run-1"]),
        "metrics:run-1": JSON.stringify(createMetrics("run-1")),
      },
    });

    const { body } = await readHealth(env);
    expect(body.status).toBe("degraded");
    expect(body.checks.snapshot_valid).toBe(false);
  });

  it("reports unhealthy when D1 is unavailable", async () => {
    const { env } = createEnv({ d1Connected: false });
    const { body } = await readHealth(env);
    expect(body.status).toBe("unhealthy");
    expect(body.checks.d1_connected).toBe(false);
  });

  it("reports unhealthy when a KV dependency is unavailable", async () => {
    const { env } = createEnv({ missingKv: "DEALS_LOG" });
    const { body } = await readHealth(env);
    expect(body.status).toBe("unhealthy");
    expect(body.checks.kv_connection).toBe(false);
  });

  it("reports degraded when there are no runs", async () => {
    const { env } = createEnv();
    const { body } = await readHealth(env);
    expect(body.status).toBe("degraded");
    expect(body.checks.last_run_success).toBe(false);
    expect(body.metrics.total_runs_24h).toBe(0);
  });

  it("reports degraded when the latest run is stale", async () => {
    const stale = createMetrics("run-stale", {
      start_time: NOW - HEALTH_WINDOW_MS - 10_000,
      end_time: NOW - HEALTH_WINDOW_MS - 5_000,
    });
    const { env } = createEnv({
      records: {
        "metrics:index": JSON.stringify(["run-stale"]),
        "metrics:run-stale": JSON.stringify(stale),
      },
    });

    const { body } = await readHealth(env);
    expect(body.status).toBe("degraded");
    expect(body.checks.last_run_success).toBe(false);
    expect(body.metrics.total_runs_24h).toBe(0);
  });

  it("counts only runs inside the true 24-hour window", async () => {
    const runs = [
      createMetrics("fresh-success", { start_time: NOW - 2000 }),
      createMetrics("fresh-failure", {
        start_time: NOW - 2000,
        success: false,
      }),
      createMetrics("old-success", {
        start_time: NOW - HEALTH_WINDOW_MS - 10_000,
        end_time: NOW - HEALTH_WINDOW_MS - 5_000,
      }),
    ];
    const records: Record<string, string> = {
      "metrics:index": JSON.stringify(runs.map((r) => r.run_id)),
    };
    for (const run of runs) {
      records[`metrics:${run.run_id}`] = JSON.stringify(run);
    }
    const { env } = createEnv({ records });

    const { body } = await readHealth(env);
    expect(body.metrics.total_runs_24h).toBe(2);
    expect(body.metrics.success_rate_24h).toBe(50);
    expect(body.components.pipeline.average_duration_ms).toBe(1000);
  });

  it("performs a bounded number of KV operations independent of log history", async () => {
    const records: Record<string, string> = {
      "metrics:index": JSON.stringify(
        Array.from({ length: HEALTH_MAX_RUNS }, (_, i) => `run-${i}`),
      ),
    };
    for (let i = 0; i < HEALTH_MAX_RUNS; i++) {
      records[`metrics:run-${i}`] = JSON.stringify(createMetrics(`run-${i}`));
    }
    for (let i = 0; i < 5000; i++) {
      records[`log:${i}`] = JSON.stringify({ run_id: `log-${i}` });
    }
    const { env, kv } = createEnv({ records });

    await readHealth(env);

    expect(kv.list).not.toHaveBeenCalled();
    expect(kv.get.mock.calls.length).toBeLessThanOrEqual(1 + HEALTH_MAX_RUNS);
  });

  it("ignores malformed metrics records without failing the probe", async () => {
    const { env } = createEnv({
      records: {
        "metrics:index": JSON.stringify(["bad", "good"]),
        "metrics:bad": "{not json",
        "metrics:good": JSON.stringify(createMetrics("good")),
      },
    });

    const { status, body } = await readHealth(env);
    expect(status).toBe(200);
    expect(body.last_run?.run_id).toBe("good");
  });
});
